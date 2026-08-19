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
  // "na" is the value the form and the submission validator use; accepting only
  // "not_applicable" here meant a job with any not-applicable item passed
  // submission and could then never be approved.
  const allowed = new Set(["pending", "done", "not_applicable", "na"]);
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
              contact_no, engineer_id, manager_id, report_date, customer_location, warranty_status,
              compressor_checklist, dryer_checklist, job_data,
              safety_critical_issue, escalated_to, quotation_required, final_test_run_result, final_equipment_status,
              internal_checklist_completed, attachments_verified
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

    // The dedicated columns default to an empty array while the real checklist lives
    // in job_data, and an empty array is truthy — so testing truthiness here meant
    // approval always validated an empty list and never looked at the actual answers.
    const compressorChecklist = job.compressor_checklist?.length
      ? job.compressor_checklist
      : job.job_data?.compressor_checklist || [];
    const dryerChecklist = job.dryer_checklist?.length
      ? job.dryer_checklist
      : job.job_data?.dryer_checklist || [];
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


    if (pricingResult.rows.length === 0) {
      details.push({ field: "pricing", message: "Pricing must be submitted before approval." });
    } else {
      const pricing = pricingResult.rows[0];
      const storedGrandTotal = Number(pricing.grand_total ?? pricing.total_after_discount ?? 0);
      const storedVatAmount = Number(pricing.vat_amount ?? 0);


      if (storedGrandTotal <= 0) {
        details.push({ field: "grand_total", message: "Grand total must be greater than 0." });
      }
    }

    const managerToValidateId = approverId || job.manager_id;
    if (managerToValidateId) {
      const manager = await signatureService.getUserSignature(managerToValidateId);
      if (!manager || !manager.signature_url) {
        details.push({ field: "manager_signature", message: "Manager signature is required before approval." });
      }
    }

    // Job closure checks. These block approval.
    //
    // They were advisory for a reason worth recording: the columns they read are
    // written by nothing but backend/utils/jobClosureFields.js, which did not
    // exist. The form has always collected these answers, but it sends them
    // inside the `evidence` object, so every check below read a NULL or a default
    // false however carefully the engineer filled the section in. Blocking on
    // that would have made approval impossible, so warning was the only safe
    // behaviour available. Now that saving a job derives these columns from the
    // evidence it stores, a correctly filled job card satisfies them and the
    // checks can do their job.
    //
    // Deliberately not wrapped in a try/catch. If the approved-documents lookup
    // fails we must not fall through to approving the job.
    if (job.safety_critical_issue === true && (!job.escalated_to || String(job.escalated_to).trim() === "")) {
      details.push({ field: "escalated_to", message: "Safety critical issue found but escalation details are missing" });
    }

    if (job.quotation_required === true) {
      const approvedDocRes = await useClient.query(
        `SELECT id FROM approved_documents WHERE job_id = $1 ORDER BY version DESC LIMIT 1`,
        [jobId]
      );
      if (approvedDocRes.rows.length === 0) {
        details.push({ field: "approved_documents", message: "Quotation is required but no approved document found" });
      }
    }

    if (!job.final_test_run_result) {
      details.push({ field: "final_test_run_result", message: "Final test run result must be recorded before approval" });
    }

    if (!job.final_equipment_status) {
      details.push({ field: "final_equipment_status", message: "Final equipment status must be recorded before approval" });
    }

    if (job.internal_checklist_completed !== true) {
      details.push({ field: "internal_checklist_completed", message: "Internal checklist must be marked as completed before approval" });
    }

    if (job.attachments_verified !== true) {
      details.push({ field: "attachments_verified", message: "Mandatory attachments (photos, sound file, checklist) must be verified before approval" });
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
