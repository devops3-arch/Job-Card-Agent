import pool from "../db.js";
import * as signatureService from "./signatureService.js";
import * as pricingService from "./pricingService.js";

export const JOB_STATUSES = {
  DRAFT: "DRAFT",
  SUBMITTED: "SUBMITTED",
  PENDING_APPROVAL: "PENDING_APPROVAL",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  DELETED: "DELETED",
  COMPLETED: "COMPLETED",
};

const STATUS_ALIASES = {
  WAITING_PRICING: JOB_STATUSES.SUBMITTED,
  WAITING_APPROVAL: JOB_STATUSES.PENDING_APPROVAL,
  CLOSED: JOB_STATUSES.COMPLETED,
  COMPLETED: JOB_STATUSES.COMPLETED,
  APPROVED: JOB_STATUSES.APPROVED,
  REJECTED: JOB_STATUSES.REJECTED,
  DELETED: JOB_STATUSES.DELETED,
  DRAFT: JOB_STATUSES.DRAFT,
  SUBMITTED: JOB_STATUSES.SUBMITTED,
  PENDING_APPROVAL: JOB_STATUSES.PENDING_APPROVAL,
};

export const ALLOWED_STATUSES = Object.values(JOB_STATUSES);
export const LEGACY_STATUS_VALUES = ["WAITING_PRICING", "WAITING_APPROVAL", "CLOSED"];
export const ALL_ALLOWED_STATUSES = [...ALLOWED_STATUSES, ...LEGACY_STATUS_VALUES];

export const normalizeStatus = (status) => {
  if (status == null) return null;
  const key = String(status).trim().toUpperCase();
  return STATUS_ALIASES[key] || key;
};

export const getAllowedTransitions = (currentStatus) => {
  const current = normalizeStatus(currentStatus);
  switch (current) {
    case JOB_STATUSES.DRAFT:
      return [JOB_STATUSES.SUBMITTED, JOB_STATUSES.DELETED];
    case JOB_STATUSES.SUBMITTED:
      return [JOB_STATUSES.PENDING_APPROVAL, JOB_STATUSES.DELETED];
    case JOB_STATUSES.PENDING_APPROVAL:
      return [JOB_STATUSES.APPROVED, JOB_STATUSES.REJECTED, JOB_STATUSES.DELETED];
    case JOB_STATUSES.APPROVED:
      return [JOB_STATUSES.COMPLETED, JOB_STATUSES.DELETED];
    case JOB_STATUSES.REJECTED:
      return [JOB_STATUSES.DELETED];
    case JOB_STATUSES.COMPLETED:
      return [JOB_STATUSES.DELETED];
    case JOB_STATUSES.DELETED:
      return [];
    default:
      return [JOB_STATUSES.DELETED];
  }
};

export const canTransition = (currentStatus, nextStatus, role) => {
  const current = normalizeStatus(currentStatus);
  const next = normalizeStatus(nextStatus);

  if (!current || !next) {
    return false;
  }

  if (current === next) {
    return false;
  }

  if (!ALL_ALLOWED_STATUSES.includes(next)) {
    return false;
  }

  if (role === "admin") {
    return current !== JOB_STATUSES.DELETED;
  }

  if (role === "engineer") {
    return (
      (current === JOB_STATUSES.DRAFT && next === JOB_STATUSES.SUBMITTED) ||
      (current === JOB_STATUSES.SUBMITTED && next === JOB_STATUSES.PENDING_APPROVAL)
    );
  }

  if (role === "manager") {
    return (
      (current === JOB_STATUSES.PENDING_APPROVAL && [JOB_STATUSES.APPROVED, JOB_STATUSES.REJECTED].includes(next)) ||
      (current !== JOB_STATUSES.DELETED && next === JOB_STATUSES.DELETED)
    );
  }

  return false;
};

const isValidEmail = (email) =>
  typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const isValidDate = (date) => typeof date === "string" && !Number.isNaN(Date.parse(date));

const isValidContactNumber = (contactNo) =>
  typeof contactNo === "string" && contactNo.trim().length >= 5;

const normalizeChecklistEntries = (value) => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (item && typeof item === "object" ? item : {}));
};

const collectChecklistIssues = (checklist, path) => {
  const problems = [];
  const allowed = new Set(["pending", "done", "not_applicable"]);
  normalizeChecklistEntries(checklist).forEach((item, index) => {
    const status = String(item.status ?? "").trim().toLowerCase();
    if (!allowed.has(status)) {
      problems.push({
        field: `${path}[${index}].status`,
        message: `Checklist item status must be one of pending, done, not_applicable.`,
      });
    }
  });
  return problems;
};

export const validateJobReadyForApproval = async ({ jobId, client = null, approverId = null }) => {
  const useClient = client || (await pool.connect());
  let release = null;
  if (!client) {
    release = useClient;
  }

  try {
    const jobResult = await useClient.query(
      `SELECT id, customer_name, job_card_no, job_date, ref_no, sales_area, service_type, email,
              contact_no, engineer_id, manager_id, compressor_checklist, dryer_checklist, job_data
       FROM job_master
       WHERE id = $1`,
      [jobId]
    );

    if (jobResult.rows.length === 0) {
      return {
        success: false,
        error: {
          code: "JOB_NOT_FOUND",
          message: "Job not found.",
          details: [],
        },
      };
    }

    const job = jobResult.rows[0];
    const details = [];

    if (!job.customer_name || String(job.customer_name).trim() === "") {
      details.push({ field: "customer_name", message: "Customer name is required." });
    }
    if (!job.job_card_no || String(job.job_card_no).trim() === "") {
      details.push({ field: "job_card_no", message: "Job card number is required." });
    }
    if (!job.job_date || !isValidDate(job.job_date)) {
      details.push({ field: "job_date", message: "Valid job date is required." });
    }
    if (!job.service_type || String(job.service_type).trim() === "") {
      details.push({ field: "service_type", message: "Purpose of visit is required." });
    }
    if (job.email && !isValidEmail(job.email)) {
      details.push({ field: "email", message: "Valid customer email is required." });
    }
    if (!isValidContactNumber(job.contact_no)) {
      details.push({ field: "contact_no", message: "Valid customer contact number is required." });
    }
    if (!job.engineer_id) {
      details.push({ field: "engineer_id", message: "Engineer assignment is required." });
    }
    if (!job.manager_id) {
      details.push({ field: "manager_id", message: "Manager assignment is required." });
    }
    if (!job.sales_area || String(job.sales_area).trim() === "") {
      details.push({ field: "sales_area", message: "Sales area is required." });
    }

    const compressorChecklist = job.compressor_checklist || job.job_data?.compressor_checklist || [];
    const dryerChecklist = job.dryer_checklist || job.job_data?.dryer_checklist || [];
    details.push(...collectChecklistIssues(compressorChecklist, "compressor_checklist"));
    details.push(...collectChecklistIssues(dryerChecklist, "dryer_checklist"));

    const partsResult = await useClient.query(
      `SELECT part_name AS description, part_name, quantity, unit_price FROM job_parts WHERE job_id = $1`,
      [jobId]
    );
    const laborResult = await useClient.query(
      `SELECT description, hours, rate FROM job_labor WHERE job_id = $1`,
      [jobId]
    );

    if (partsResult.rows.length === 0) {
      details.push({ field: "parts", message: "At least one part line item is required." });
    }
    partsResult.rows.forEach((part, idx) => {
      const description = String(part.description ?? part.part_name ?? "").trim();
      if (!description) {
        details.push({ field: `parts[${idx}].description`, message: "Part description is required." });
      }
      if (Number(part.quantity) <= 0) {
        details.push({ field: `parts[${idx}].quantity`, message: "Part quantity must be greater than 0." });
      }
      if (Number(part.unit_price) <= 0) {
        details.push({ field: `parts[${idx}].unit_price`, message: "Part unit price must be greater than 0." });
      }
    });

    if (laborResult.rows.length === 0) {
      details.push({ field: "labor", message: "At least one labour line item is required." });
    }
    laborResult.rows.forEach((labor, idx) => {
      const description = String(labor.description ?? "").trim();
      if (!description) {
        details.push({ field: `labor[${idx}].description`, message: "Labour description is required." });
      }
      if (Number(labor.hours) <= 0) {
        details.push({ field: `labor[${idx}].hours`, message: "Labour hours must be greater than 0." });
      }
      if (Number(labor.rate) <= 0) {
        details.push({ field: `labor[${idx}].rate`, message: "Labour rate must be greater than 0." });
      }
    });

    const pricingQuery = `SELECT * FROM pricing_header WHERE job_id = $1 ORDER BY created_at DESC LIMIT 1`;
    const pricingResult = await useClient.query(pricingQuery, [jobId]);

    console.log('[validateJobReadyForApproval] pricing query:', pricingQuery, 'values:', [jobId]);
    console.log('[validateJobReadyForApproval] pricing row:', pricingResult.rows[0]);

    if (pricingResult.rows.length === 0) {
      details.push({ field: "pricing", message: "Pricing must be submitted before approval." });
    } else {
      const pricing = pricingResult.rows[0];
      const storedGrandTotal = Number(pricing.grand_total ?? pricing.total_after_discount ?? 0);
      const storedVatAmount = Number(pricing.vat_amount ?? 0);

      console.log('[validateJobReadyForApproval] pricing totals:', {
        grand_total: pricing.grand_total,
        total_after_discount: pricing.total_after_discount,
        vat_amount: pricing.vat_amount,
        storedGrandTotal,
        storedVatAmount,
      });

      if (storedGrandTotal <= 0) {
        details.push({ field: "grand_total", message: "Grand total must be greater than 0." });
      }
    }

    const managerToValidateId = approverId || job.manager_id;
    console.log('[validateJobReadyForApproval] manager signature lookup', { jobId, approverId, managerToValidateId });
    if (managerToValidateId) {
      const manager = await signatureService.getUserSignature(managerToValidateId);
      console.log('[validateJobReadyForApproval] manager row:', manager);
      if (!manager || !manager.signature_url) {
        details.push({ field: "manager_signature", message: "Manager signature is required before approval." });
      }
    }

    if (details.length > 0) {
      return {
        success: false,
        error: {
          code: "JOB_NOT_READY_FOR_APPROVAL",
          message: "Job card has missing required information.",
          details,
        },
      };
    }

    return { success: true };
  } finally {
    if (release) {
      release.release();
    }
  }
};
