import pool from "../db.js";

const BASE_URL = "http://localhost:5000";

// Helper for HTTP requests
const request = async (method, path, role, userId, body = null) => {
  const url = `${BASE_URL}${path}`;
  const headers = {
    "x-dev-user-role": role,
    "x-dev-user-id": String(userId),
  };
  if (body) {
    headers["Content-Type"] = "application/json";
  }

  const options = {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
  };

  const response = await fetch(url, options);
  const json = await response.json();
  return { status: response.status, data: json };
};

// Check standard FORBIDDEN payload structure
const verifyForbiddenPayload = (res) => {
  if (res.status !== 403) return false;
  const data = res.data;
  return (
    data.success === false &&
    data.error &&
    data.error.code === "FORBIDDEN" &&
    data.error.message === "You do not have permission to perform this action."
  );
};

const runTests = async () => {
  console.log("=== STARTING RBAC INTEGRATION TESTS ===");

  // 1. Seed test users
  const dummyHash = "$2a$10$xyz123invalidhashplaceholderforrbac";
  
  // Clean up any stale test users/jobs first to ensure clean state
  await pool.query("DELETE FROM job_master WHERE customer_name LIKE 'RBAC TEST%'");
  await pool.query("DELETE FROM users WHERE email LIKE '%@rbac.test'");

  const engARes = await pool.query(
    "INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id",
    ["Bijmon Mathai", "eng_a@rbac.test", dummyHash, "engineer"]
  );
  const engBRes = await pool.query(
    "INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id",
    ["Sinoy Syamalan", "eng_b@rbac.test", dummyHash, "engineer"]
  );
  const mgrARes = await pool.query(
    "INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id",
    ["Nitesh gawali", "mgr_a@rbac.test", dummyHash, "manager"]
  );
  const mgrBRes = await pool.query(
    "INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id",
    ["Arvind kumar Jaiswal", "mgr_b@rbac.test", dummyHash, "manager"]
  );
  const adminRes = await pool.query(
    "INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id",
    ["Admin User", "adm_a@rbac.test", dummyHash, "admin"]
  );

  const engA = { id: engARes.rows[0].id, role: "engineer" };
  const engB = { id: engBRes.rows[0].id, role: "engineer" };
  const mgrA = { id: mgrARes.rows[0].id, role: "manager" };
  const mgrB = { id: mgrBRes.rows[0].id, role: "manager" };
  const admin = { id: adminRes.rows[0].id, role: "admin" };

  console.log("Seeded test users successfully.");
  console.log(`- Bijmon Mathai (engineer): ID ${engA.id}`);
  console.log(`- Sinoy Syamalan (engineer):   ID ${engB.id}`);
  console.log(`- Nitesh gawali (manager):   ID ${mgrA.id}`);
  console.log(`- Arvind kumar Jaiswal (manager):   ID ${mgrB.id}`);
  console.log(`- Admin User (admin):       ID ${admin.id}`);

  let passed = true;

  const assert = (condition, message) => {
    if (condition) {
      console.log(`[PASS] ${message}`);
    } else {
      console.error(`[FAIL] ${message}`);
      passed = false;
    }
  };

  try {
    // ----------------------------------------------------
    // TEST A: Job Creation
    // ----------------------------------------------------
    console.log("\n--- Testing Job Creation ---");

    const jobDataA = {
      customer_name: "RBAC TEST Customer A",
      equipment_name: "Compressor X1",
      job_card_no: "JC-RBAC-001",
      job_data: {
        manager_name: "Nitesh gawali",
      },
    };

    const createRes = await request("POST", "/jobs", engA.role, engA.id, jobDataA);
    assert(createRes.status === 200, "Bijmon Mathai can create a job");
    const jobAId = createRes.data.data?.id;
    assert(jobAId > 0, `Returned valid job ID: ${jobAId}`);

    // Verify it was correctly stored with correct engineer_id and manager_id
    const dbJobA = (await pool.query("SELECT * FROM job_master WHERE id = $1", [jobAId])).rows[0];
    assert(dbJobA.engineer_id === engA.id, "Engineer ID is correctly stored as Bijmon Mathai");
    assert(dbJobA.manager_id === mgrA.id, "Manager ID is correctly resolved to Nitesh gawali's ID");

    // ----------------------------------------------------
    // TEST B: Job Listing
    // ----------------------------------------------------
    console.log("\n--- Testing Job Listing (GET /jobs) ---");

    // Create a job for Engineer B assigned to Manager B
    const jobDataB = {
      customer_name: "RBAC TEST Customer B",
      equipment_name: "Dryer Y2",
      job_card_no: "JC-RBAC-002",
      job_data: {
        manager_name: "Arvind kumar Jaiswal",
      },
    };
    const createBRes = await request("POST", "/jobs", engB.role, engB.id, jobDataB);
    const jobBId = createBRes.data.data?.id;

    // Fetch lists
    const listEngARes = await request("GET", "/jobs", engA.role, engA.id);
    const idsEngA = listEngARes.data.data.map(j => j.id);
    assert(idsEngA.includes(jobAId) && !idsEngA.includes(jobBId), "Bijmon Mathai only lists own jobs");

    const listEngBRes = await request("GET", "/jobs", engB.role, engB.id);
    const idsEngB = listEngBRes.data.data.map(j => j.id);
    assert(idsEngB.includes(jobBId) && !idsEngB.includes(jobAId), "Sinoy Syamalan only lists own jobs");

    const listMgrARes = await request("GET", "/jobs", mgrA.role, mgrA.id);
    const idsMgrA = listMgrARes.data.data.map(j => j.id);
    assert(idsMgrA.includes(jobAId) && !idsMgrA.includes(jobBId), "Nitesh gawali only lists assigned jobs");

    const listMgrBRes = await request("GET", "/jobs", mgrB.role, mgrB.id);
    const idsMgrB = listMgrBRes.data.data.map(j => j.id);
    assert(idsMgrB.includes(jobBId) && !idsMgrB.includes(jobAId), "Arvind kumar Jaiswal only lists assigned jobs");

    const listAdminRes = await request("GET", "/jobs", admin.role, admin.id);
    const idsAdmin = listAdminRes.data.data.map(j => j.id);
    assert(idsAdmin.includes(jobAId) && idsAdmin.includes(jobBId), "Admin can list all jobs");

    // ----------------------------------------------------
    // TEST C: Job Details Read
    // ----------------------------------------------------
    console.log("\n--- Testing Job Details Read (GET /jobs/:id) ---");

    const readOwnRes = await request("GET", `/jobs/${jobAId}`, engA.role, engA.id);
    assert(readOwnRes.status === 200, "Engineer A can view own job");

    const readOtherRes = await request("GET", `/jobs/${jobAId}`, engB.role, engB.id);
    assert(verifyForbiddenPayload(readOtherRes), "Engineer B is forbidden from viewing Engineer A's job with standard payload");

    const readMgrOwnRes = await request("GET", `/jobs/${jobAId}`, mgrA.role, mgrA.id);
    assert(readMgrOwnRes.status === 200, "Manager A can view assigned job");

    const readMgrOtherRes = await request("GET", `/jobs/${jobAId}`, mgrB.role, mgrB.id);
    assert(verifyForbiddenPayload(readMgrOtherRes), "Manager B is forbidden from viewing Manager A's assigned job");

    const readAdminRes = await request("GET", `/jobs/${jobAId}`, admin.role, admin.id);
    assert(readAdminRes.status === 200, "Admin can view any job");

    // ----------------------------------------------------
    // TEST D: Job Updates (PUT /jobs/:id)
    // ----------------------------------------------------
    console.log("\n--- Testing Job Updates (PUT /jobs/:id) ---");

    const updateOwnRes = await request("PUT", `/jobs/${jobAId}`, engA.role, engA.id, {
      customer_name: "RBAC TEST Customer A Updated",
    });
    assert(updateOwnRes.status === 200, "Engineer A can update own job");

    const updateOtherRes = await request("PUT", `/jobs/${jobAId}`, engB.role, engB.id, {
      customer_name: "RBAC TEST Violator",
    });
    assert(verifyForbiddenPayload(updateOtherRes), "Engineer B is forbidden from updating Engineer A's job");

    const updateMgrOwnRes = await request("PUT", `/jobs/${jobAId}`, mgrA.role, mgrA.id, {
      job_data: {
        manager_name: "Manager B", // Reassign to Manager B
      },
    });
    assert(updateMgrOwnRes.status === 200, "Manager A can update assigned job (e.g., manager reassignment)");
    
    // Verify resolved reassignment in DB
    const dbJobAReassigned = (await pool.query("SELECT * FROM job_master WHERE id = $1", [jobAId])).rows[0];
    assert(dbJobAReassigned.manager_id === mgrB.id, "Manager ID resolves and updates to Manager B");

    // ----------------------------------------------------
    // TEST E: Pricing Updates
    // ----------------------------------------------------
    console.log("\n--- Testing Pricing Updates ---");

    const pricingPayload = {
      labour_rate: 100,
      service_charge: 50,
      discount: 10,
      vat_percent: 5,
      parts_total: 200,
      labour_total: 100,
      taxable_amount: 340,
      vat_amount: 17,
      grand_total: 357,
    };

    // Now assigned to Manager B, so Manager A should be blocked, Manager B should succeed
    const priceMgrARes = await request("POST", `/jobs/${jobAId}/pricing`, mgrA.role, mgrA.id, pricingPayload);
    assert(verifyForbiddenPayload(priceMgrARes), "Manager A is now forbidden from pricing job A since reassigned");

    const priceMgrBRes = await request("POST", `/jobs/${jobAId}/pricing`, mgrB.role, mgrB.id, pricingPayload);
    assert(priceMgrBRes.status === 200, "Manager B can update pricing of job A");

    // ----------------------------------------------------
    // TEST F: Job Approval / Status Update
    // ----------------------------------------------------
    console.log("\n--- Testing Status Updates ---");

    const statusPayload = { status: "APPROVED" };

    const approveMgrARes = await request("PUT", `/jobs/${jobAId}/status`, mgrA.role, mgrA.id, statusPayload);
    assert(verifyForbiddenPayload(approveMgrARes), "Manager A is forbidden from approving job A");

    const approveMgrBRes = await request("PUT", `/jobs/${jobAId}/status`, mgrB.role, mgrB.id, statusPayload);
    assert(approveMgrBRes.status === 200, "Manager B can approve job A");

    // ----------------------------------------------------
    // TEST G: Document Approved / Upload
    // ----------------------------------------------------
    console.log("\n--- Testing Approved Documents Retrieval ---");

    const docGetMgrARes = await request("GET", `/approved-documents/job/${jobAId}`, mgrA.role, mgrA.id);
    assert(verifyForbiddenPayload(docGetMgrARes), "Manager A is forbidden from retrieving approved documents for job A");

    const docGetMgrBRes = await request("GET", `/approved-documents/job/${jobAId}`, mgrB.role, mgrB.id);
    assert(docGetMgrBRes.status === 200, "Manager B can retrieve approved documents for job A");

    // ----------------------------------------------------
    // TEST H: AI Summary Route Verification
    // ----------------------------------------------------
    console.log("\n--- Testing AI summary routes ---");

    const aiSummaryMgrARes = await request("GET", `/routes/ai/job-summary/${jobAId}`, mgrA.role, mgrA.id);
    assert(verifyForbiddenPayload(aiSummaryMgrARes), "Manager A is forbidden from generating summary for job A");

    const aiSummaryMgrBRes = await request("GET", `/routes/ai/job-summary/${jobAId}`, mgrB.role, mgrB.id);
    // Note: Since openAi mock isn't running or might throw 500/404 based on OpenAI connection,
    // we just check if it bypasses 403 Forbidden properly. (If not 403, permissions checks bypassed correctly).
    assert(aiSummaryMgrBRes.status !== 403, "Manager B successfully bypasses Forbidden check for job-summary");

    // ----------------------------------------------------
    // TEST I: Backward Compatibility (NULL manager_id)
    // ----------------------------------------------------
    console.log("\n--- Testing Backward Compatibility ---");

    // Create a legacy job directly in DB with NULL manager_id
    const legacyJobRes = await pool.query(
      `INSERT INTO job_master (customer_name, equipment_name, status, engineer_id, manager_id)
       VALUES ('RBAC TEST Legacy Job', 'Old Generator', 'WAITING_PRICING', $1, NULL) RETURNING id`,
      [engA.id]
    );
    const legacyJobId = legacyJobRes.rows[0].id;

    const readLegacyEngARes = await request("GET", `/jobs/${legacyJobId}`, engA.role, engA.id);
    assert(readLegacyEngARes.status === 200, "Engineer A can view legacy own job");

    const readLegacyMgrARes = await request("GET", `/jobs/${legacyJobId}`, mgrA.role, mgrA.id);
    assert(readLegacyMgrARes.status === 200, "Manager A can temporarily view legacy job with NULL manager_id");

    const readLegacyMgrBRes = await request("GET", `/jobs/${legacyJobId}`, mgrB.role, mgrB.id);
    assert(readLegacyMgrBRes.status === 200, "Manager B can temporarily view legacy job with NULL manager_id");

  } catch (err) {
    console.error("Test execution threw error:", err);
    passed = false;
  } finally {
    // Clean up
    console.log("\nCleaning up test data...");
    await pool.query("DELETE FROM job_master WHERE customer_name LIKE 'RBAC TEST%'");
    await pool.query("DELETE FROM users WHERE email LIKE '%@rbac.test'");
    await pool.end();
  }

  if (passed) {
    console.log("\n=== ALL RBAC TESTS PASSED SUCCESSFULLY! ===");
    process.exit(0);
  } else {
    console.error("\n=== SOME RBAC TESTS FAILED! ===");
    process.exit(1);
  }
};

runTests();
