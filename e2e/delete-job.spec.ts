import { test, expect } from "@playwright/test";

import {
  API_URL,
  DEMO,
  apiLogin,
  authHeaders,
  createJob,
  filledClosureEvidence,
  jobPayload,
  type Session,
} from "./helpers";

/**
 * Deleting a job card.
 *
 * The endpoint was unreachable from the UI and broken underneath it: the UPDATE
 * bound deleted_by (integer) and updated_by (text) to the same $2, so Postgres
 * could not deduce a type for the parameter and every request failed with
 * "inconsistent types deduced for parameter $2". No job had ever been deleted.
 * Any test that actually called the endpoint would have caught it, so here it is.
 */

let engineer: Session;
let manager: Session;

test.beforeAll(async ({ request }) => {
  engineer = await apiLogin(request, DEMO.engineer);
  manager = await apiLogin(request, DEMO.manager);
});

const newJob = () => jobPayload({ manager_id: manager.userId, evidence: filledClosureEvidence() });

const deleteJob = (request, session: Session, jobId: number, body: unknown) =>
  request.delete(`${API_URL}/jobs/${jobId}`, { headers: authHeaders(session), data: body });

test.describe("deleting a job card", () => {
  test("a manager can delete a job assigned to them, and it leaves the list", async ({ request }) => {
    const jobId = await createJob(request, engineer, newJob());

    const before = await request.get(`${API_URL}/jobs`, { headers: authHeaders(manager) });
    const beforeIds = ((await before.json()).data ?? []).map((j: { id: number }) => Number(j.id));
    expect(beforeIds).toContain(jobId);

    const res = await deleteJob(request, manager, jobId, { delete_reason: "Raised against the wrong customer" });
    expect(res.status(), `delete failed: ${await res.text()}`).toBe(200);
    expect((await res.json()).data.status).toBe("DELETED");

    const after = await request.get(`${API_URL}/jobs`, { headers: authHeaders(manager) });
    const afterIds = ((await after.json()).data ?? []).map((j: { id: number }) => Number(j.id));
    expect(afterIds).not.toContain(jobId);
  });

  test("the reason is mandatory", async ({ request }) => {
    const jobId = await createJob(request, engineer, newJob());

    const noBody = await deleteJob(request, manager, jobId, {});
    expect(noBody.status()).toBe(400);

    const blank = await deleteJob(request, manager, jobId, { delete_reason: "   " });
    expect(blank.status()).toBe(400);

    // Still there, because neither attempt was accepted.
    const list = await request.get(`${API_URL}/jobs`, { headers: authHeaders(manager) });
    const ids = ((await list.json()).data ?? []).map((j: { id: number }) => Number(j.id));
    expect(ids).toContain(jobId);
  });

  test("an engineer cannot delete a job card", async ({ request }) => {
    const jobId = await createJob(request, engineer, newJob());

    const res = await deleteJob(request, engineer, jobId, { delete_reason: "trying it on" });

    expect([401, 403]).toContain(res.status());
  });

  test("a manager the job is not assigned to cannot delete it", async ({ request }) => {
    const other = await apiLogin(request, DEMO.otherManager);
    const jobId = await createJob(request, engineer, newJob());

    const res = await deleteJob(request, other, jobId, { delete_reason: "not mine to delete" });

    expect(res.status()).toBe(403);
  });

  test("deleting twice is refused rather than silently repeated", async ({ request }) => {
    const jobId = await createJob(request, engineer, newJob());

    const first = await deleteJob(request, manager, jobId, { delete_reason: "duplicate entry" });
    expect(first.status()).toBe(200);

    const second = await deleteJob(request, manager, jobId, { delete_reason: "duplicate entry" });
    expect(second.status()).toBe(400);
    expect((await second.json()).error.code).toBe("JOB_ALREADY_DELETED");
  });

  test("an over-long reason is rejected rather than truncated into the record", async ({ request }) => {
    const jobId = await createJob(request, engineer, newJob());

    const res = await deleteJob(request, manager, jobId, { delete_reason: "x".repeat(501) });

    expect(res.status()).toBe(400);
  });
});
