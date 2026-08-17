/**
 * Mandatory-field rules for a job card, shared by the create and update routes.
 *
 * Kept in its own module with no database or Express dependencies so the rules can
 * be tested directly — importing server.js would start a listener.
 */

import AppError from "../utils/AppError.js";

export const INCOMPLETE_JOB_ERROR = "Job card is incomplete. Please complete all required fields.";

/** A checklist counts as complete when every row carries a recognised status. */
export const isChecklistComplete = (items) => {
  const allowedStatuses = new Set(["done", "na", "pending"]);
  return (
    Array.isArray(items) &&
    items.length > 0 &&
    items.every((item) => allowedStatuses.has(String(item?.status ?? "").trim().toLowerCase()))
  );
};

/** Mandatory text fields, paired with the label the user sees on the form. */
export const JOB_TEXT_FIELDS = [
  ["customer_name", "Customer name"],
  ["ref_no", "Reference number"],
  ["job_card_no", "Job card number"],
  ["job_date", "Job date"],
  ["service_type", "Service type"],
  ["customer_code", "Customer code"],
  ["attention_of", "Attention of"],
  ["contact_no", "Contact number"],
  ["sales_area", "Sales area"],
  ["equipment_model", "Equipment model"],
  ["equipment_brand_description", "Equipment brand / description"],
  ["equipment_part_no", "Equipment part number"],
  ["equipment_serial_no", "Equipment serial number"],
  ["equipment_year", "Equipment year"],
];

/**
 * Collects every mandatory-field problem on a job card instead of failing on the
 * first one. Returning the whole set lets the form highlight each offending field;
 * a bare "job card is incomplete" with an empty details array left the user
 * guessing which of thirty-odd fields was at fault.
 *
 * Accepts both the camelCase shape the pricing panel sends and the snake_case
 * shape the job form and the create route's own mappers produce.
 *
 * @returns {Array<{field: string, message: string}>} empty when the card is complete
 */
export const collectJobCardIssues = ({ fields = {}, jobData, parts, labor }) => {
  const details = [];

  for (const [field, label] of JOB_TEXT_FIELDS) {
    const value = fields[field];
    if (typeof value !== "string" || !value.trim()) {
      details.push({ field, message: `${label} is required.` });
    }
  }

  if (!jobData || typeof jobData !== "object") {
    details.push({ field: "job_data", message: "Job details are required." });
  } else {
    if (!String(jobData.engineer_name ?? "").trim()) {
      details.push({ field: "job_data.engineer_name", message: "Engineer name is required." });
    }
    if (!isChecklistComplete(jobData.compressor_checklist)) {
      details.push({
        field: "job_data.compressor_checklist",
        message: "Every compressor checklist item needs a status of done, na or pending.",
      });
    }
    if (!isChecklistComplete(jobData.dryer_checklist)) {
      details.push({
        field: "job_data.dryer_checklist",
        message: "Every dryer checklist item needs a status of done, na or pending.",
      });
    }
  }

  if (!Array.isArray(parts) || parts.length === 0) {
    details.push({ field: "parts", message: "At least one part is required." });
  } else {
    parts.forEach((part, index) => {
      if (!String(part?.description ?? part?.part_name ?? "").trim()) {
        details.push({ field: `parts[${index}].part_name`, message: "Part description is required." });
      }
      if (!String(part?.partNumber ?? part?.part_number ?? "").trim()) {
        details.push({ field: `parts[${index}].part_number`, message: "Part number is required." });
      }
      const quantity = Number(part?.qty ?? part?.quantity);
      if (!quantity || quantity <= 0) {
        details.push({
          field: `parts[${index}].quantity`,
          message: "Part quantity must be greater than 0.",
        });
      }
    });
  }

  if (!Array.isArray(labor) || labor.length === 0) {
    details.push({ field: "labor", message: "At least one labour line is required." });
  } else {
    labor.forEach((row, index) => {
      const hours = Number(row?.hours);
      if (!hours || hours <= 0) {
        details.push({
          field: `labor[${index}].hours`,
          message: "Labour hours must be greater than 0.",
        });
      }
    });
  }

  return details;
};

/** Raises a 400 carrying every collected problem, or returns quietly. */
export const throwIfIncomplete = (details) => {
  if (details.length > 0) {
    throw new AppError(INCOMPLETE_JOB_ERROR, 400, "VALIDATION_ERROR", details);
  }
};

export default { collectJobCardIssues, throwIfIncomplete, isChecklistComplete, INCOMPLETE_JOB_ERROR };
