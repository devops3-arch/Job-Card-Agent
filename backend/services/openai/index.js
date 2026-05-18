import dotenv from "dotenv";

dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-3.5-turbo";
const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";

const safeString = (value) =>
  typeof value === "string" ? value.trim() : String(value ?? "").trim();

const getNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const sendOpenAIRequest = async (messages, maxTokens = 250, temperature = 0.25) => {
  if (!OPENAI_API_KEY) {
    throw new Error("OpenAI API key not configured");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(OPENAI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages,
        max_tokens: maxTokens,
        temperature,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OpenAI request failed: ${response.status} ${response.statusText} ${errorBody}`);
    }

    const body = await response.json();
    return body?.choices?.[0]?.message?.content?.trim() ?? "";
  } finally {
    clearTimeout(timeout);
  }
};

const fallbackCleanText = (description) =>
  safeString(description)
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .trim();

export const cleanWorkDescription = async (description) => {
  const normalized = safeString(description);
  if (!normalized) {
    return { original: normalized, cleaned: "" };
  }

  if (!OPENAI_API_KEY) {
    return {
      original: normalized,
      cleaned: fallbackCleanText(normalized),
      note: "OpenAI not configured. Returned cleaned description using fallback logic.",
    };
  }

  try {
    const prompt = [
      {
        role: "system",
        content:
          "You are a professional field service report assistant. Rewrite the work description into a single concise, professional sentence.",
      },
      { role: "user", content: `Work description: ${normalized}` },
    ];
    const cleaned = await sendOpenAIRequest(prompt, 120, 0.2);
    return { original: normalized, cleaned: cleaned || fallbackCleanText(normalized) };
  } catch (err) {
    return {
      original: normalized,
      cleaned: fallbackCleanText(normalized),
      error: err.message,
    };
  }
};

const buildSummaryPayload = ({ job, pricing }) => {
  const parts = [
    `Customer: ${safeString(job.customer_name) || "Unknown"}`,
    `Job card: ${safeString(job.job_card_no) || "N/A"}`,
    `Equipment: ${safeString(job.equipment_name) || "N/A"}`,
    `Service: ${safeString(job.service_type) || "N/A"}`,
    `Sales area: ${safeString(job.sales_area) || "N/A"}`,
    `Date: ${safeString(job.job_date) || "N/A"}`,
  ];

  if (pricing) {
    parts.push(`Estimated total AED ${getNumber(pricing.grand_total).toFixed(2)}`);
  }

  return parts.join("; ");
};

const fallbackSummary = ({ job, pricing }) => {
  const summaryText = buildSummaryPayload({ job, pricing });
  return `${summaryText}. ${pricing?.grand_total ? "Pricing is available." : "Pricing is not yet available."}`;
};

export const generateJobSummary = async ({ job, pricing = {} }) => {
  if (!job) {
    return { summary: "No job details provided." };
  }

  if (!OPENAI_API_KEY) {
    return {
      summary: fallbackSummary({ job, pricing }),
      note: "OpenAI not configured; summary generated with fallback logic.",
    };
  }

  try {
    const messages = [
      {
        role: "system",
        content:
          "You are a concise field service summary assistant. Provide a short summary of the job and pricing in plain language.",
      },
      {
        role: "user",
        content: `Create a short executive summary for this job: ${JSON.stringify({
          customer_name: safeString(job.customer_name),
          job_card_no: safeString(job.job_card_no),
          equipment_name: safeString(job.equipment_name),
          job_date: safeString(job.job_date),
          service_type: safeString(job.service_type),
          sales_area: safeString(job.sales_area),
          pricing: {
            grand_total: getNumber(pricing.grand_total),
            parts_total: getNumber(pricing.parts_total),
            labour_total: getNumber(pricing.labour_total),
            vat_amount: getNumber(pricing.vat_amount),
          },
        })}`,
      },
    ];
    const content = await sendOpenAIRequest(messages, 180, 0.3);
    return { summary: content || fallbackSummary({ job, pricing }) };
  } catch (err) {
    return {
      summary: fallbackSummary({ job, pricing }),
      error: err.message,
    };
  }
};

export const generatePdfReadiness = async ({ job, hasApprovedDocument }) => {
  const ready = job?.status === "APPROVED" && Boolean(hasApprovedDocument);
  const fallback = {
    ready,
    reason: ready
      ? "Job is approved and an approved document exists."
      : job?.status !== "APPROVED"
      ? "Job still requires manager approval before a signed PDF can be produced."
      : "Job is approved but an approved document snapshot is not yet present.",
    recommendation:
      job?.status !== "APPROVED"
        ? "Approve the job and upload manager signature; then generate final approval documentation."
        : "Create or confirm the approved document snapshot for PDF generation.",
  };

  if (!OPENAI_API_KEY) {
    return { ...fallback, note: "OpenAI not configured; using fallback readiness heuristics." };
  }

  try {
    const payload = {
      status: safeString(job.status),
      job_card_no: safeString(job.job_card_no),
      customer_name: safeString(job.customer_name),
      equipment_name: safeString(job.equipment_name),
      approved_document_present: Boolean(hasApprovedDocument),
      pricing: {
        grand_total: getNumber(job.grand_total),
        parts_total: getNumber(job.parts_total),
        labour_total: getNumber(job.labour_total),
      },
    };

    const messages = [
      {
        role: "system",
        content:
          "You are a service operations assistant. Assess whether this job is ready for final PDF approval and return a simple readiness answer and recommendation.",
      },
      {
        role: "user",
        content: `Assess these details for PDF readiness: ${JSON.stringify(payload)}`,
      },
    ];

    const result = await sendOpenAIRequest(messages, 240, 0.3);
    return { ...fallback, ai_assessment: result };
  } catch (err) {
    return { ...fallback, ai_error: err.message };
  }
};

export const generateZohoNote = async ({ job, pricing, manager, engineer }) => {
  const noteFallback = `Job ${safeString(job.job_card_no)} for ${safeString(job.customer_name)} has been approved with total AED ${getNumber(pricing?.grand_total).toFixed(2)}. Manager ID: ${manager?.id ?? "N/A"}. Engineer ID: ${engineer?.id ?? "N/A"}.`;

  if (!OPENAI_API_KEY) {
    return { note: noteFallback, fallback: true, message: "OpenAI not configured; using fallback CRM note." };
  }

  try {
    const summaryData = {
      job_card_no: safeString(job.job_card_no),
      customer_name: safeString(job.customer_name),
      equipment_name: safeString(job.equipment_name),
      status: safeString(job.status),
      total: getNumber(pricing?.grand_total),
      manager_id: manager?.id ?? null,
      engineer_id: engineer?.id ?? null,
    };

    const messages = [
      {
        role: "system",
        content:
          "You are a CRM assistant creating a short Zoho CRM update note for an approved service job.",
      },
      {
        role: "user",
        content: `Create a short customer-facing Zoho note for this approval: ${JSON.stringify(summaryData)}`,
      },
    ];

    const content = await sendOpenAIRequest(messages, 160, 0.4);
    return { note: content || noteFallback };
  } catch (err) {
    return {
      note: noteFallback,
      error: err.message,
      fallback: true,
    };
  }
};
