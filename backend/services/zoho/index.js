/**
 * Zoho Books integration.
 *
 * Pushes an approved job card to Zoho Books as an invoice. Inert until credentials
 * are configured: every entry point returns { success: false, skipped: true } rather
 * than throwing, so an unconfigured deployment behaves exactly as it did before.
 *
 * Required configuration:
 *   ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN, ZOHO_ORGANIZATION_ID
 * Optional:
 *   ZOHO_DC — data centre suffix: com (default), eu, in, com.au, jp, ca
 */

import logger from "../logger/logger.js";

const REQUEST_TIMEOUT_MS = 15000;

const config = () => ({
  clientId: process.env.ZOHO_CLIENT_ID,
  clientSecret: process.env.ZOHO_CLIENT_SECRET,
  refreshToken: process.env.ZOHO_REFRESH_TOKEN,
  organizationId: process.env.ZOHO_ORGANIZATION_ID,
  dc: process.env.ZOHO_DC || "com",
});

export const isConfigured = () => {
  const { clientId, clientSecret, refreshToken, organizationId } = config();
  return Boolean(clientId && clientSecret && refreshToken && organizationId);
};

/** Zoho hosts each data centre on its own domain pair. */
export const getEndpoints = (dc = config().dc) => ({
  accounts: `https://accounts.zoho.${dc}/oauth/v2/token`,
  api: `https://www.zohoapis.${dc}/books/v3`,
});

// Access tokens last an hour; cache until shortly before expiry.
let cachedToken = null;

export const resetTokenCache = () => {
  cachedToken = null;
};

const fetchWithTimeout = async (url, options = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const getAccessToken = async (now = Date.now()) => {
  if (cachedToken && cachedToken.expiresAt > now) {
    return cachedToken.token;
  }

  const { clientId, clientSecret, refreshToken, dc } = config();
  const params = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  });

  const response = await fetchWithTimeout(`${getEndpoints(dc).accounts}?${params}`, { method: "POST" });
  const body = await response.json().catch(() => ({}));

  if (!response.ok || !body.access_token) {
    throw new Error(`Zoho token exchange failed: ${body.error || response.status}`);
  }

  const ttlSeconds = Number(body.expires_in) || 3600;
  cachedToken = {
    token: body.access_token,
    // 60s of headroom so a token never expires mid-request.
    expiresAt: now + (ttlSeconds - 60) * 1000,
  };
  return cachedToken.token;
};

const zohoRequest = async (path, { method = "GET", body } = {}) => {
  const token = await getAccessToken();
  const { organizationId, dc } = config();
  const separator = path.includes("?") ? "&" : "?";
  const url = `${getEndpoints(dc).api}${path}${separator}organization_id=${organizationId}`;

  const response = await fetchWithTimeout(url, {
    method,
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Zoho ${method} ${path} failed: ${payload.message || response.status}`);
  }
  return payload;
};

/**
 * Builds Zoho invoice line items from a job card.
 *
 * Pure, so the mapping can be tested without credentials. Parts and labour become
 * separate lines; the service charge becomes its own line when non-zero. Anything
 * priced at zero is dropped — Zoho rejects zero-rate lines on some plans, and a
 * zero line carries no information anyway.
 */
export const buildLineItems = ({ parts = [], labor = [], serviceCharge = 0 } = {}) => {
  const items = [];

  for (const part of parts) {
    const quantity = Number(part?.quantity ?? part?.qty) || 0;
    const rate = Number(part?.unit_price ?? part?.unitPrice) || 0;
    const name = String(part?.part_name ?? part?.description ?? "").trim();
    if (!name || quantity <= 0 || rate <= 0) continue;
    items.push({
      name,
      description: String(part?.part_number ?? part?.partNumber ?? "").trim() || undefined,
      quantity,
      rate,
    });
  }

  for (const row of labor) {
    const quantity = Number(row?.hours) || 0;
    const rate = Number(row?.rate ?? row?.ratePerHour) || 0;
    const name = String(row?.description ?? "").trim() || "Labour";
    if (quantity <= 0 || rate <= 0) continue;
    items.push({ name, description: "Labour hours", quantity, rate });
  }

  const charge = Number(serviceCharge) || 0;
  if (charge > 0) {
    items.push({ name: "Service charge", quantity: 1, rate: charge });
  }

  return items;
};

/** Finds a Zoho contact by name, creating one if it does not exist. */
const findOrCreateContact = async (customerName) => {
  const name = String(customerName || "").trim();
  if (!name) throw new Error("A customer name is required to raise a Zoho invoice");

  const search = await zohoRequest(`/contacts?contact_name=${encodeURIComponent(name)}`);
  const existing = (search.contacts || []).find(
    (c) => String(c.contact_name).toLowerCase() === name.toLowerCase()
  );
  if (existing) return existing.contact_id;

  const created = await zohoRequest("/contacts", {
    method: "POST",
    body: { contact_name: name, contact_type: "customer" },
  });
  return created.contact?.contact_id;
};

/**
 * Raises a Zoho Books invoice for an approved job card.
 *
 * @returns {Promise<{success: boolean, skipped?: boolean, message: string, invoiceId?: string, invoiceNumber?: string}>}
 */
export const createInvoiceForJob = async ({ job, parts = [], labor = [], serviceCharge = 0 } = {}) => {
  if (!isConfigured()) {
    logger.debug("Zoho invoice skipped: not configured", { eventType: "zoho" });
    return { success: false, skipped: true, message: "Zoho Books is not configured" };
  }

  const lineItems = buildLineItems({ parts, labor, serviceCharge });
  if (lineItems.length === 0) {
    return { success: false, message: "Nothing to invoice: the job card has no priced lines" };
  }

  try {
    const contactId = await findOrCreateContact(job?.customer_name);
    const invoice = await zohoRequest("/invoices", {
      method: "POST",
      body: {
        customer_id: contactId,
        reference_number: job?.job_card_no || job?.ref_no || undefined,
        date: job?.job_date ? String(job.job_date).slice(0, 10) : undefined,
        line_items: lineItems,
        notes: job?.job_card_no ? `Job card ${job.job_card_no}` : undefined,
      },
    });

    const created = invoice.invoice || {};
    logger.info("Zoho invoice created", {
      eventType: "zoho",
      jobId: job?.id,
      invoiceId: created.invoice_id,
      invoiceNumber: created.invoice_number,
      lineItems: lineItems.length,
    });

    return {
      success: true,
      message: `Invoice ${created.invoice_number || created.invoice_id} created in Zoho Books`,
      invoiceId: created.invoice_id,
      invoiceNumber: created.invoice_number,
    };
  } catch (error) {
    logger.error("Zoho invoice failed", {
      eventType: "zoho",
      jobId: job?.id,
      error: error.message,
    });
    return { success: false, message: error.message };
  }
};

/**
 * Backwards-compatible entry point. The previous placeholder had this signature and
 * always reported "not yet implemented"; it now raises a real invoice when configured.
 */
export const sendToZoho = async (payload) => createInvoiceForJob(payload || {});

export default { isConfigured, createInvoiceForJob, sendToZoho, buildLineItems, getEndpoints, resetTokenCache };
