// Job status helpers.
//
// Mirrors the canonical statuses and legacy aliases defined by the backend in
// backend/services/jobWorkflowService.js. Counting by substring (e.g.
// status.includes("APPROV")) is unsafe because PENDING_APPROVAL and
// WAITING_APPROVAL both contain "APPROV" — use these predicates instead.

export const JOB_STATUSES = {
  DRAFT: "DRAFT",
  SUBMITTED: "SUBMITTED",
  PENDING_APPROVAL: "PENDING_APPROVAL",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  DELETED: "DELETED",
  COMPLETED: "COMPLETED",
} as const;

export type JobStatus = (typeof JOB_STATUSES)[keyof typeof JOB_STATUSES];

// Legacy values still present on older rows, mapped to their canonical form.
const STATUS_ALIASES: Record<string, JobStatus> = {
  WAITING_PRICING: JOB_STATUSES.SUBMITTED,
  WAITING_APPROVAL: JOB_STATUSES.PENDING_APPROVAL,
  CLOSED: JOB_STATUSES.COMPLETED,
};

export function normalizeStatus(status?: string | null): string {
  const key = (status ?? "").trim().toUpperCase();
  if (!key) return JOB_STATUSES.DRAFT;
  return STATUS_ALIASES[key] ?? key;
}

export const isApproved = (status?: string | null) =>
  normalizeStatus(status) === JOB_STATUSES.APPROVED;

export const isRejected = (status?: string | null) =>
  normalizeStatus(status) === JOB_STATUSES.REJECTED;

export const isSubmitted = (status?: string | null) =>
  normalizeStatus(status) === JOB_STATUSES.SUBMITTED;

// Awaiting a manager decision.
export const isAwaitingApproval = (status?: string | null) =>
  normalizeStatus(status) === JOB_STATUSES.PENDING_APPROVAL;

// Anything a manager still has to act on: not yet submitted, or submitted and
// waiting on a decision.
export const isOpen = (status?: string | null) => {
  const s = normalizeStatus(status);
  return (
    s === JOB_STATUSES.DRAFT ||
    s === JOB_STATUSES.SUBMITTED ||
    s === JOB_STATUSES.PENDING_APPROVAL
  );
};
