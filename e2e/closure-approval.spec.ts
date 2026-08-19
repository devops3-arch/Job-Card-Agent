import { test, expect } from "@playwright/test";

import {
  DEMO,
  apiLogin,
  attemptApproval,
  createJob,
  filledClosureEvidence,
  jobPayload,
  updateJob,
  type Session,
} from "./helpers";

/**
 * The job closure answers travel a long way: the form collects them into one
 * camelCase `evidence` object, the API derives seven job_master columns from it,
 * and approval validation reads those columns. Unit tests cover each end of that
 * separately; only a run through the real server and database shows the whole
 * path connected. Before utils/jobClosureFields.js existed, the columns were never
 * written, so every check below read a NULL or a default false no matter what was
 * filled in.
 */

const CLOSURE_FIELDS = [
  "final_test_run_result",
  "final_equipment_status",
  "internal_checklist_completed",
  "attachments_verified",
];

let engineer: Session;
let manager: Session;

test.beforeAll(async ({ request }) => {
  engineer = await apiLogin(request, DEMO.engineer);
  manager = await apiLogin(request, DEMO.manager);
});

/** A job assigned to the manager who will try to approve it. */
const newJob = (over: Record<string, unknown> = {}) =>
  jobPayload({ manager_id: manager.userId, ...over });

test.describe("the closure section gates approval", () => {
  test("a job with the closure section untouched is refused, naming every missing answer", async ({
    request,
  }) => {
    const jobId = await createJob(request, engineer, newJob());

    const result = await attemptApproval(request, manager, jobId);

    expect(result.status).toBe(400);
    expect(result.code).toBe("JOB_NOT_READY_FOR_APPROVAL");
    expect(result.fields).toEqual(expect.arrayContaining(CLOSURE_FIELDS));
  });

  test("filling the closure section clears those objections", async ({ request }) => {
    const payload = newJob();
    const jobId = await createJob(request, engineer, payload);

    const beforeFilling = await attemptApproval(request, manager, jobId);
    expect(beforeFilling.fields).toEqual(expect.arrayContaining(CLOSURE_FIELDS));

    await updateJob(request, engineer, jobId, { ...payload, evidence: filledClosureEvidence() });

    const afterFilling = await attemptApproval(request, manager, jobId);

    // Other rules (pricing, the manager's signature) may still object; what matters
    // is that none of the closure answers are among the complaints any more.
    for (const field of CLOSURE_FIELDS) {
      expect(afterFilling.fields, `${field} should no longer block approval`).not.toContain(field);
    }
  });

  test("the answers are saved on creation too, not only on a later edit", async ({ request }) => {
    const jobId = await createJob(request, engineer, newJob({ evidence: filledClosureEvidence() }));

    const result = await attemptApproval(request, manager, jobId);

    for (const field of CLOSURE_FIELDS) {
      expect(result.fields, `${field} should have been recorded at creation`).not.toContain(field);
    }
  });

  test("unticking a confirmation takes effect rather than leaving the old value", async ({ request }) => {
    const payload = newJob({ evidence: filledClosureEvidence() });
    const jobId = await createJob(request, engineer, payload);

    const whenFilled = await attemptApproval(request, manager, jobId);
    expect(whenFilled.fields).not.toContain("internal_checklist_completed");

    await updateJob(request, engineer, jobId, {
      ...payload,
      evidence: filledClosureEvidence({ internalChecklistCompleted: false }),
    });

    const whenUnticked = await attemptApproval(request, manager, jobId);
    expect(whenUnticked.fields).toContain("internal_checklist_completed");
  });
});

test.describe("safety critical work must record an escalation", () => {
  test("a safety critical job with no escalation details is refused", async ({ request }) => {
    const jobId = await createJob(
      request,
      engineer,
      newJob({
        evidence: filledClosureEvidence({ safetyCriticalIssue: true, escalatedToTime: "" }),
      }),
    );

    const result = await attemptApproval(request, manager, jobId);

    expect(result.fields).toContain("escalated_to");
  });

  test("recording who it went to satisfies the rule", async ({ request }) => {
    const jobId = await createJob(
      request,
      engineer,
      newJob({
        evidence: filledClosureEvidence({
          safetyCriticalIssue: true,
          escalatedToTime: "Escalated to R. Menon 14:20",
        }),
      }),
    );

    const result = await attemptApproval(request, manager, jobId);

    expect(result.fields).not.toContain("escalated_to");
  });
});

test.describe("a quotation requires an approved document", () => {
  test("flagging a quotation with nothing uploaded is refused", async ({ request }) => {
    const jobId = await createJob(
      request,
      engineer,
      newJob({ evidence: filledClosureEvidence({ quotationRequired: true }) }),
    );

    const result = await attemptApproval(request, manager, jobId);

    expect(result.fields).toContain("approved_documents");
  });
});

test.describe("only the answers the form offers are accepted", () => {
  // The mapper allows exactly the values the dropdowns offer. A client sending
  // anything else must leave the column unanswered rather than parking a junk
  // value in something approval decisions are made on.
  test("an invented final test result does not count as an answer", async ({ request }) => {
    const jobId = await createJob(
      request,
      engineer,
      newJob({ evidence: filledClosureEvidence({ finalTestResult: "Probably fine" }) }),
    );

    const result = await attemptApproval(request, manager, jobId);

    expect(result.fields).toContain("final_test_run_result");
  });

  test('the string "false" does not tick a confirmation', async ({ request }) => {
    const jobId = await createJob(
      request,
      engineer,
      newJob({ evidence: filledClosureEvidence({ mandatoryAttachmentsVerified: "false" }) }),
    );

    const result = await attemptApproval(request, manager, jobId);

    expect(result.fields).toContain("attachments_verified");
  });
});

test.describe("approval stays a manager's job", () => {
  test("an engineer cannot approve their own job card", async ({ request }) => {
    const jobId = await createJob(request, engineer, newJob({ evidence: filledClosureEvidence() }));

    const result = await attemptApproval(request, engineer, jobId);

    expect([401, 403]).toContain(result.status);
  });

  test("a manager the job is not assigned to cannot approve it", async ({ request }) => {
    const other = await apiLogin(request, DEMO.otherManager);
    const jobId = await createJob(request, engineer, newJob({ evidence: filledClosureEvidence() }));

    const result = await attemptApproval(request, other, jobId);

    expect(result.status).toBe(403);
  });
});
