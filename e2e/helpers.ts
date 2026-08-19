import { APIRequestContext, Page, expect } from "@playwright/test";

export const API_URL = process.env.E2E_API_URL ?? `http://localhost:${process.env.E2E_API_PORT ?? 5099}`;

/**
 * Seeded by backend/scripts/seedDemoUsers.js. Every demo account shares the same
 * password, which is fine — this database is local only, enforced by
 * e2e/globalSetup.ts.
 */
export const DEMO = {
  engineer: { email: "bijmon@example.com", password: "Password123!", name: "Bijmon Mathai" },
  manager: { email: "nitesh@example.com", password: "Password123!", name: "Nitesh gawali" },
  otherManager: { email: "arvind@example.com", password: "Password123!", name: "Arvind kumar Jaiswal" },
} as const;

export type Credentials = { email: string; password: string };

export type Session = {
  token: string;
  userId: number;
  role: string;
  name: string;
};

/** Reads the claims out of a JWT without verifying it — the server already did. */
const jwtClaims = (token: string): { id: number; role: string; name: string } => {
  const [, payload] = token.split(".");
  const normalised = payload.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(Buffer.from(normalised, "base64").toString("utf8"));
};

/** Logs in over the API and returns the token plus who it belongs to. */
export async function apiLogin(request: APIRequestContext, who: Credentials): Promise<Session> {
  // loginSchema is strict, so only the two fields it declares may be sent — the
  // DEMO entries also carry a name, which would be rejected as an unknown key.
  const response = await request.post(`${API_URL}/auth/login`, {
    data: { email: who.email, password: who.password },
  });
  if (response.status() !== 200) {
    throw new Error(
      `login for ${who.email} returned ${response.status()}: ${await response.text()}`,
    );
  }

  const body = await response.json();
  const token: string = body.data?.accessToken ?? body.data?.token;
  expect(token, "login response should carry an access token").toBeTruthy();

  const claims = jwtClaims(token);
  return { token, userId: claims.id, role: claims.role, name: claims.name };
}

export const authHeaders = (session: Session) => ({ Authorization: `Bearer ${session.token}` });

/**
 * A job card with everything the earlier approval rules ask for, so that the only
 * thing a spec has to vary is the closure section. Parts and labour are attached
 * by the create route from these arrays.
 */
/** Keeps job_card_no unique within a run without reaching for randomness. */
let jobCardSequence = 0;

export const jobPayload = (over: Record<string, unknown> = {}) => ({
  // Every field in JOB_TEXT_FIELDS (backend/validators/jobCardValidation.js) has to
  // be present, or the engineer's submission is rejected before any of the closure
  // rules are reached.
  customer_name: "Acme Cold Storage",
  equipment_name: "Kaeser SK 25 compressor",
  job_card_no: `E2E-${Date.now()}-${++jobCardSequence}`,
  job_date: "2026-08-19",
  ref_no: "E2E-REF",
  sales_area: "Dubai",
  service_type: "service_contract",
  customer_code: "ACME-01",
  attention_of: "Site Supervisor",
  email: "ops@acme.test",
  contact_no: "+971500000000",
  equipment_model: "SK 25",
  equipment_brand_description: "Kaeser rotary screw compressor",
  equipment_part_no: "SK25-001",
  equipment_serial_no: "SN-778812",
  equipment_year: "2021",
  parts: [
    {
      description: "Air filter",
      part_name: "Air filter",
      part_number: "AF-1001",
      partNumber: "AF-1001",
      qty: 2,
      quantity: 2,
      unit_price: 150,
      unitPrice: 150,
    },
  ],
  labor: [{ description: "On-site service", hours: 3, rate: 100, ratePerHour: 100 }],
  job_data: {
    engineer_name: DEMO.engineer.name,
    // Both checklists must be non-empty and every item carry a known status.
    compressor_checklist: [
      { id: 1, description: "Check oil level", status: "done" },
      { id: 2, description: "Check air filter", status: "done" },
    ],
    dryer_checklist: [{ id: 1, description: "Check drain valve", status: "na" }],
  },
  ...over,
});

/** The closure answers as the form's "Mandatory Evidence & Job Closure" section sends them. */
export const filledClosureEvidence = (over: Record<string, unknown> = {}) => ({
  soundFileReference: [],
  photosReference: [],
  dbReading: "72",
  partsReplaced: "Air filter",
  finalTestResult: "Pass",
  finalEquipmentStatus: "Fully Operational",
  quotationRequired: false,
  safetyCriticalIssue: false,
  escalatedToTime: "",
  internalChecklistCompleted: true,
  mandatoryAttachmentsVerified: true,
  jobReadyForInvoicing: true,
  ...over,
});

/** Creates a job as the given session and returns its id. */
export async function createJob(
  request: APIRequestContext,
  session: Session,
  payload: Record<string, unknown>,
): Promise<number> {
  const response = await request.post(`${API_URL}/jobs`, {
    headers: authHeaders(session),
    data: payload,
  });

  const body = await response.json();
  expect(response.status(), `job creation failed: ${JSON.stringify(body)}`).toBeLessThan(300);

  const id = body.data?.job?.id ?? body.data?.id ?? body.id;
  expect(id, "created job should have an id").toBeTruthy();
  return Number(id);
}

/**
 * Saves a job. An engineer's save re-runs the whole job card completeness check
 * against the submitted body, so callers must send the full payload — a partial
 * update of just one section comes back 400 with every other field listed.
 */
export async function updateJob(
  request: APIRequestContext,
  session: Session,
  jobId: number,
  payload: Record<string, unknown>,
): Promise<void> {
  const response = await request.put(`${API_URL}/jobs/${jobId}`, {
    headers: authHeaders(session),
    data: payload,
  });

  if (response.status() >= 300) {
    throw new Error(`saving job ${jobId} returned ${response.status()}: ${await response.text()}`);
  }
}

/** Attempts to move a job to APPROVED and hands back the status and error details. */
export async function attemptApproval(
  request: APIRequestContext,
  session: Session,
  jobId: number,
): Promise<{ status: number; code?: string; fields: string[]; body: unknown }> {
  const response = await request.put(`${API_URL}/jobs/${jobId}/status`, {
    headers: authHeaders(session),
    data: { status: "APPROVED" },
  });

  const body = await response.json().catch(() => ({}));
  const details: Array<{ field?: string }> = body?.error?.details ?? [];

  return {
    status: response.status(),
    code: body?.error?.code,
    fields: details.map((d) => d.field).filter((f): f is string => Boolean(f)),
    body,
  };
}

/**
 * The form's submit button. Scoped to the form because the page also carries a
 * "Sign In" mode-toggle tab, so an unscoped lookup matches two elements.
 */
export const submitButton = (page: Page) => page.locator('form button[type="submit"]');

/** Signs in through the real login form and waits for the app to take over. */
export async function loginViaUi(page: Page, who: Credentials): Promise<void> {
  await page.goto("/auth");
  await page.locator("#email").fill(who.email);
  await page.locator("#password").fill(who.password);
  await submitButton(page).click();

  // The app stores the token and leaves /auth once the login lands.
  await expect(page).not.toHaveURL(/\/auth/, { timeout: 15_000 });
}
