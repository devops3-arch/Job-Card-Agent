import express from "express";
import asyncHandler from "../middleware/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import * as openAiService from "../services/openai/index.js";
import pool from "../db.js";
import AppError from "../utils/AppError.js";
import { validate } from "../middleware/validate.js";
import { aiDescriptionSchema, idParamSchema } from "../validators/schemas.js";

const router = express.Router();

router.post(
  "/clean-work-description",
  requireAuth,
  validate({ body: aiDescriptionSchema }),
  asyncHandler(async (req, res) => {
    const { description } = req.body;
    const result = await openAiService.cleanWorkDescription(description);
    return res.status(200).json({
      success: true,
      message: "Work description cleaned",
      data: result,
    });
  })
);

router.get(
  "/job-summary/:id",
  requireAuth,
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const jobId = Number(req.params.id);
    const result = await pool.query(
      `SELECT jm.*, ph.grand_total, ph.parts_total, ph.labour_total, ph.taxable_amount, ph.vat_amount, ph.vat_percent
       FROM job_master jm
       LEFT JOIN pricing_header ph ON jm.id = ph.job_id
       WHERE jm.id = $1`,
      [jobId]
    );

    if (result.rows.length === 0) {
      throw new AppError("Job not found", 404, "JOB_NOT_FOUND");
    }

    const job = result.rows[0];

    // Enforce strict ownership / assignment checks
    if (req.user.role === "engineer" && job.engineer_id !== req.user.id) {
      throw new AppError("Insufficient permissions", 403, "FORBIDDEN");
    }
    if (req.user.role === "manager" && job.manager_id !== req.user.id) {
      if (job.manager_id !== null && job.manager_id !== undefined && job.manager_id !== req.user.id) {
        throw new AppError("Insufficient permissions", 403, "FORBIDDEN");
      }
    }

    const summary = await openAiService.generateJobSummary({ job });

    return res.status(200).json({
      success: true,
      message: "Job summary generated",
      data: summary,
    });
  })
);

router.get(
  "/pdf-readiness/:id",
  requireAuth,
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const jobId = Number(req.params.id);
    const jobResult = await pool.query(
      `SELECT jm.*, ph.grand_total, ph.parts_total, ph.labour_total, ph.taxable_amount, ph.vat_amount, ph.vat_percent
       FROM job_master jm
       LEFT JOIN pricing_header ph ON jm.id = ph.job_id
       WHERE jm.id = $1`,
      [jobId]
    );

    if (jobResult.rows.length === 0) {
      throw new AppError("Job not found", 404, "JOB_NOT_FOUND");
    }

    const job = jobResult.rows[0];

    // Enforce strict ownership / assignment checks
    if (req.user.role === "engineer" && job.engineer_id !== req.user.id) {
      throw new AppError("Insufficient permissions", 403, "FORBIDDEN");
    }
    if (req.user.role === "manager" && job.manager_id !== req.user.id) {
      if (job.manager_id !== null && job.manager_id !== undefined && job.manager_id !== req.user.id) {
        throw new AppError("Insufficient permissions", 403, "FORBIDDEN");
      }
    }

    const approvedDocumentResult = await pool.query(
      `SELECT id FROM approved_documents WHERE job_id = $1 ORDER BY version DESC LIMIT 1`,
      [jobId]
    );
    const hasApprovedDocument = approvedDocumentResult.rows.length > 0;
    const readiness = await openAiService.generatePdfReadiness({
      job,
      hasApprovedDocument,
    });

    return res.status(200).json({
      success: true,
      message: "PDF readiness evaluated",
      data: readiness,
    });
  })
);

export default router;
