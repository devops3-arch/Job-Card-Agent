import { describe, test, expect } from "vitest";

import { JOB_STATUSES, formatStatus, normalizeStatus } from "./jobStatus";

describe("formatStatus", () => {
  test.each([
    [JOB_STATUSES.DRAFT, "Draft"],
    [JOB_STATUSES.SUBMITTED, "Submitted"],
    [JOB_STATUSES.PENDING_APPROVAL, "Pending Approval"],
    [JOB_STATUSES.APPROVED, "Approved"],
    [JOB_STATUSES.REJECTED, "Rejected"],
    [JOB_STATUSES.DELETED, "Deleted"],
    [JOB_STATUSES.COMPLETED, "Completed"],
  ])("%s reads as %s", (status, expected) => {
    expect(formatStatus(status)).toBe(expected);
  });

  // The exported PDF used to print the enum straight into a document sent to a
  // customer.
  test("never leaks a raw enum", () => {
    for (const status of Object.values(JOB_STATUSES)) {
      expect(formatStatus(status)).not.toContain("_");
      expect(formatStatus(status)).not.toBe(status);
    }
  });

  test("legacy names land on their current label", () => {
    expect(formatStatus("WAITING_APPROVAL")).toBe("Pending Approval");
    expect(formatStatus("WAITING_PRICING")).toBe("Submitted");
    expect(formatStatus("CLOSED")).toBe("Completed");
  });

  test("is insensitive to case and whitespace", () => {
    expect(formatStatus("  pending_approval ")).toBe("Pending Approval");
    expect(formatStatus("Approved")).toBe("Approved");
  });

  test("an absent status reads as Draft, matching normalizeStatus", () => {
    expect(formatStatus(null)).toBe("Draft");
    expect(formatStatus(undefined)).toBe("Draft");
    expect(formatStatus("")).toBe("Draft");
    expect(normalizeStatus("")).toBe(JOB_STATUSES.DRAFT);
  });

  // A status added to the backend before this map is updated should still read as
  // words, not as an enum.
  test("titles an unrecognised status rather than printing it raw", () => {
    expect(formatStatus("AWAITING_PARTS")).toBe("Awaiting Parts");
    expect(formatStatus("ON_HOLD")).toBe("On Hold");
  });

  // PENDING_APPROVAL and APPROVED both contain "APPROV", which is what made the
  // three hand-rolled substring versions of this fragile.
  test("does not confuse pending approval with approved", () => {
    expect(formatStatus(JOB_STATUSES.PENDING_APPROVAL)).toBe("Pending Approval");
    expect(formatStatus(JOB_STATUSES.APPROVED)).toBe("Approved");
    expect(formatStatus(JOB_STATUSES.PENDING_APPROVAL)).not.toBe(
      formatStatus(JOB_STATUSES.APPROVED),
    );
  });
});
