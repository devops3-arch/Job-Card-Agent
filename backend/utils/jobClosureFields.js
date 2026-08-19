/**
 * Bridges the job closure answers the form collects into the job_master columns
 * that approval validation reads.
 *
 * The form gathers all of this in its "Mandatory Evidence & Job Closure" section
 * and sends it as one camelCase `evidence` object, which is stored whole in the
 * `evidence` JSONB column. Migration 013 also added dedicated columns for the
 * same answers, and jobWorkflowService validates against those columns — but
 * nothing ever wrote them, so every one of those checks read a NULL or a default
 * false regardless of what the engineer actually filled in. This module is the
 * missing half: it derives the columns from the evidence object so the two sides
 * agree.
 *
 * The allowed values below are the same ones the form's dropdowns offer and the
 * same ones backend/validators/schemas.js accepts. Anything unrecognised becomes
 * null rather than being written through, so a malformed client cannot park a
 * junk value in a column that approval decisions are made on.
 */

export const FINAL_TEST_RUN_RESULTS = ["Pass", "Fail", "Temporary Fix", "N/A"];

export const FINAL_EQUIPMENT_STATUSES = [
  "Fully Operational",
  "Temporarily Operational",
  "Stopped",
  "Pending Parts",
  "Further Diagnosis Required",
];

const ESCALATED_TO_MAX_LENGTH = 255;

/** Maps each column to the evidence key it is derived from. */
export const CLOSURE_COLUMN_SOURCES = {
  final_test_run_result: "finalTestResult",
  final_equipment_status: "finalEquipmentStatus",
  quotation_required: "quotationRequired",
  safety_critical_issue: "safetyCriticalIssue",
  escalated_to: "escalatedToTime",
  internal_checklist_completed: "internalChecklistCompleted",
  attachments_verified: "mandatoryAttachmentsVerified",
};

export const CLOSURE_COLUMNS = Object.keys(CLOSURE_COLUMN_SOURCES);

const pickFromAllowed = (value, allowed) => {
  const candidate = String(value ?? "").trim();
  return allowed.includes(candidate) ? candidate : null;
};

// Only a real boolean true counts. The checkboxes send booleans, and treating a
// truthy string like "false" as consent would defeat the point of the check.
const asStrictBoolean = (value) => value === true;

const asEscalatedTo = (value) => {
  const text = String(value ?? "").trim();
  if (!text) {
    return null;
  }
  return text.slice(0, ESCALATED_TO_MAX_LENGTH);
};

/**
 * Derives the closure columns from a form `evidence` object.
 *
 * @param {unknown} evidence the camelCase evidence object as the client sends it
 * @returns {Record<string, string|boolean|null>} column name → value, always
 *   with every closure column present so an update cannot leave a stale value
 *   behind from a previous save.
 */
export const deriveClosureFields = (evidence) => {
  const source = evidence && typeof evidence === "object" && !Array.isArray(evidence) ? evidence : {};

  return {
    final_test_run_result: pickFromAllowed(source.finalTestResult, FINAL_TEST_RUN_RESULTS),
    final_equipment_status: pickFromAllowed(source.finalEquipmentStatus, FINAL_EQUIPMENT_STATUSES),
    quotation_required: asStrictBoolean(source.quotationRequired),
    safety_critical_issue: asStrictBoolean(source.safetyCriticalIssue),
    escalated_to: asEscalatedTo(source.escalatedToTime),
    internal_checklist_completed: asStrictBoolean(source.internalChecklistCompleted),
    attachments_verified: asStrictBoolean(source.mandatoryAttachmentsVerified),
  };
};

export default deriveClosureFields;
