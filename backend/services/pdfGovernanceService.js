import pool from "../db.js";

export const generateApprovalSnapshot = ({ job, pricing, manager, engineer, approvedAt }) => {
  return {
    customer_name: job.customer_name ?? null,
    job_card_no: job.job_card_no ?? null,
    job_date: job.job_date ?? null,
    ref_no: job.ref_no ?? null,
    sales_area: job.sales_area ?? null,
    service_type: job.service_type ?? null,
    pricing_totals: {
      parts_total: pricing?.parts_total ?? null,
      labour_total: pricing?.labour_total ?? null,
      taxable_amount: pricing?.taxable_amount ?? null,
      vat_amount: pricing?.vat_amount ?? null,
      grand_total: pricing?.grand_total ?? pricing?.total_after_discount ?? null,
    },
    manager: {
      id: manager?.id ?? null,
      name: manager?.name ?? null,
      role: manager?.role ?? null,
      signature_url: manager?.signature_url ?? null,
      signature_uploaded_at: manager?.signature_uploaded_at ?? null,
    },
    engineer: {
      id: engineer?.id ?? null,
      name: engineer?.name ?? null,
      role: engineer?.role ?? null,
      signature_url: engineer?.signature_url ?? null,
      signature_uploaded_at: engineer?.signature_uploaded_at ?? null,
    },
    approval_timestamp: (approvedAt ?? new Date()).toISOString(),
    job_status: job.status ?? null,
    approval_metadata: {
      job_id: job.id,
      generated_by: manager?.id ?? null,
      generated_at: (approvedAt ?? new Date()).toISOString(),
    },
  };
};

export const createApprovedDocumentRecord = async ({ client, jobId, pdfUrl = null, pdfHash = null, generatedBy, snapshot }) => {
  const versionResult = await client.query(
    "SELECT MAX(version) AS max_version FROM approved_documents WHERE job_id = $1",
    [jobId]
  );
  const version = (versionResult.rows[0]?.max_version ?? 0) + 1;

  const result = await client.query(
    `INSERT INTO approved_documents
       (job_id, pdf_url, pdf_hash, generated_by, generated_at, is_locked, version, approval_snapshot)
     VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, TRUE, $5, $6)
     RETURNING *`,
    [jobId, pdfUrl, pdfHash, generatedBy, version, snapshot]
  );

  return result.rows[0];
};

export const getApprovedDocumentsByJob = async (jobId) => {
  const result = await pool.query(
    `SELECT * FROM approved_documents
     WHERE job_id = $1
     ORDER BY version DESC`,
    [jobId]
  );
  return result.rows;
};
