import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import bcrypt from "bcryptjs";
import swaggerUi from "swagger-ui-express";
import pool from "./db.js";
import AppError from "./utils/AppError.js";
import asyncHandler from "./middleware/asyncHandler.js";
import errorHandler from "./middleware/errorHandler.js";
import { logAuditEvent } from "./audit.js";
import { validate } from "./middleware/validate.js";
import { globalLimiter, authLimiter } from "./middleware/rateLimiters.js";
import { signatureUpload, documentUpload, saveUploadedFile, deleteUploadedFile } from "./middleware/upload.js";
import { generateSecureFilename } from "./utils/uploadHelpers.js";
import { generateToken, requireAuth, requireRole, requireDevOrAdmin } from "./middleware/auth.js";
import * as tokenService from "./services/tokenService.js";
import * as eventService from "./services/eventService.js";
import * as signatureService from "./services/signatureService.js";
import * as pdfGovernanceService from "./services/pdfGovernanceService.js";
import storageService from "./services/storage/storageService.js";
import logger from "./services/logger/logger.js";
import { requestCorrelation, requestLogger } from "./services/logger/requestLogger.js";
import workerManager from "./workers/workerManager.js";
import integrationsRouter from "./routes/integrations.js";
import aiRouter from "./routes/ai.routes.js";
import * as openAiService from "./services/openai/index.js";
import * as n8nService from "./services/n8n/index.js";
import { specs } from "./docs/openapi.js";
import {
  loginSchema,
  refreshTokenSchema,
  logoutSchema,
  jobCreationSchema,
  jobUpdateSchema,
  pricingSchema,
  statusUpdateSchema,
  userCreationSchema,
  signatureUploadSchema,
  pdfGenerationSchema,
  aiDescriptionSchema,
  idParamSchema,
} from "./validators/schemas.js";

dotenv.config();

const app = express();

// ─── Middleware ───────────────────────────────────────────────────────────────
app.disable("x-powered-by");
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

// Request correlation and logging (must be early in middleware chain)
app.use(requestCorrelation);
app.use(requestLogger);
app.use(globalLimiter);

// Serve uploaded files
app.use("/uploads", express.static("uploads"));

// ─── Swagger UI ──────────────────────────────────────────────────────────────
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(specs));

// ─── Integrations routes ──────────────────────────────────────────────────────
app.use("/integrations", integrationsRouter);
app.use("/api/ai", aiRouter);

// ─── Response helpers ─────────────────────────────────────────────────────────
const sendSuccess = (res, data, message = "Action completed successfully", statusCode = 200) =>
    res.status(statusCode).json({ success: true, message, data });

const sendError = (res, statusCode, message, code = "INTERNAL_ERROR", details = {}) => {
    const body = {
        success: false,
        message,
        error: {
            code,
            details
        }
    };
    return res.status(statusCode).json(body);
};

// ─── Utilities ────────────────────────────────────────────────────────────────
const toNum = (v, fallback = 0) => {
    const n = Number(v);
    return isNaN(n) ? fallback : n;
};

const isValidEmail = (email) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const isValidDate = (d) =>
    d && !isNaN(Date.parse(d));

// Map frontend part object → job_parts row
const mapPart = (p) => {
    const qty        = toNum(p.qty        ?? p.quantity);
    const unit_price = toNum(p.unitPrice  ?? p.unit_price);
    return {
        part_name:  p.description ?? p.part_name ?? "",
        quantity:   qty,
        unit_price,
        total: toNum(p.totalPrice ?? p.total, qty * unit_price),
    };
};

// Map frontend labor object → job_labor row
const mapLabor = (l) => {
    const hours = toNum(l.hours);
    const rate  = toNum(l.ratePerHour ?? l.rate);
    return {
        description: l.description ?? "",
        hours,
        rate,
        total: toNum(l.totalCost ?? l.total, hours * rate),
    };
};

const ALLOWED_STATUSES = ["WAITING_PRICING", "APPROVED", "REJECTED", "CLOSED"];
const SYSTEM_USER = "system_user";

// ─── Health checks ────────────────────────────────────────────────────────────
/**
 * @swagger
 * /:
 *   get:
 *     summary: Basic health check
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Backend is running
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: Backend is running
 */
app.get("/", (_req, res) => res.send("Backend is running"));

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Application health check
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Application is healthy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       500:
 *         description: Application is unhealthy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.get("/health", (_req, res) => sendSuccess(res, { status: "healthy", timestamp: new Date().toISOString() }));

/**
 * @swagger
 * /test-db:
 *   get:
 *     summary: Test database connectivity
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Database connection successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       500:
 *         description: Database connection failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.get(
  "/test-db",
  asyncHandler(async (_req, res) => {
    const result = await pool.query("SELECT NOW()");
    return sendSuccess(res, { time: result.rows[0] });
  })
);

/**
 * @swagger
 * /ready:
 *   get:
 *     summary: Readiness check for required services
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Required services are reachable
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       503:
 *         description: Required service is unavailable
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.get(
  "/ready",
  asyncHandler(async (_req, res) => {
    try {
      const result = await pool.query("SELECT 1");
      return sendSuccess(res, { database: "ok", time: new Date().toISOString() });
    } catch (err) {
      return sendError(res, 503, "Database connectivity failed", "DATABASE_UNAVAILABLE", { error: err.message });
    }
  })
);

// ─── POST /jobs ───────────────────────────────────────────────────────────────
/**
 * @swagger
 * /jobs:
 *   post:
 *     summary: Create a new job
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - customer_name
 *             properties:
 *               customer_name:
 *                 type: string
 *                 description: Name of the customer
 *               job_card_no:
 *                 type: string
 *                 description: Job card number
 *               job_date:
 *                 type: string
 *                 format: date
 *                 description: Date of the job
 *               ref_no:
 *                 type: string
 *                 description: Reference number
 *               sales_area:
 *                 type: string
 *                 description: Sales area
 *               service_type:
 *                 type: string
 *                 description: Type of service
 *               under_warranty:
 *                 type: boolean
 *                 description: Whether the equipment is under warranty
 *                 default: false
 *     responses:
 *       200:
 *         description: Job created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       400:
 *         description: Bad request - missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized - invalid or missing token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden - insufficient role
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// Creates a new job with only REQUIRED fields. Defensive, never crashes.
app.post(
  "/jobs",
  requireAuth,
  requireRole("engineer"),
  validate({ body: jobCreationSchema }),
  asyncHandler(async (req, res) => {
    req.logger.info("Create job request received", {
      eventType: "job_creation",
      payload: {
        body: req.body,
      },
    });

    // Extract engineer ID from authenticated user
    const userId = req.user?.id;
    req.logger.debug("Creating job for engineer", {
      engineerId: userId,
    });
    
    if (!userId) {
        return sendError(res, 401, "Engineer ID not found in token");
    }

    // Safe field extraction - no validation beyond existence
    const customer_name = req.body?.customer_name || null;
    const equipment_name = req.body?.equipment_name || null;
    const job_card_no = req.body?.job_card_no || null;
    const job_date = req.body?.job_date || null;
    const ref_no = req.body?.ref_no || null;
    const sales_area = req.body?.sales_area || null;
    const service_type = req.body?.service_type || null;
    const under_warranty = req.body?.under_warranty ?? false;
    const customer_code = req.body?.customer_code || null;
    const attention_of = req.body?.attention_of || null;
    const email = req.body?.email || null;
    const contact_no = req.body?.contact_no || null;
    const other_expenses = toNum(req.body?.other_expenses);
    const discount_percentage = toNum(req.body?.discount_percentage);
    const partsInput = Array.isArray(req.body?.parts) ? req.body.parts : [];
    const laborInput = Array.isArray(req.body?.labor) ? req.body.labor : [];
    const partsJson = partsInput.map(mapPart);
    const laborJson = laborInput.map(mapLabor);
    const jobData = {
      ...(typeof req.body?.job_data === "object" && req.body.job_data ? req.body.job_data : {}),
      parts: partsJson,
      labor: laborJson,
      compressor_checklist: req.body?.compressor_checklist ?? [],
      dryer_checklist: req.body?.dryer_checklist ?? [],
    };

    // ONLY validation: customer_name and equipment_name are required
    if (!customer_name) {
        return sendError(res, 400, "Customer name is required");
    }
    if (!equipment_name) {
        return sendError(res, 400, "Equipment name is required");
    }

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // Insert required fields including engineer_id from authenticated user
        const result = await client.query(
            `INSERT INTO job_master
             (customer_name, equipment_name, job_card_no, job_date, ref_no, sales_area, service_type,
              under_warranty, customer_code, attention_of, email, contact_no, other_expenses,
              discount_percentage, parts, labor, job_data, status, engineer_id, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
             RETURNING *`,
            [
                customer_name,
                equipment_name,
                job_card_no,
                job_date,
                ref_no,
                sales_area,
                service_type,
                under_warranty,
                customer_code,
                attention_of,
                email,
                contact_no,
                other_expenses,
                discount_percentage,
                JSON.stringify(partsJson),
                JSON.stringify(laborJson),
                jobData,
                "WAITING_PRICING",
                userId,
                userId,
            ]
        );

        const createdJob = result.rows[0];
        const jobId = createdJob.id;

        if (partsJson.length > 0) {
          for (const part of partsJson) {
            await client.query(
              `INSERT INTO job_parts (job_id, part_name, quantity, unit_price, total)
               VALUES ($1, $2, $3, $4, $5)`,
              [jobId, part.part_name, part.quantity, part.unit_price, part.total]
            );
          }
        }

        if (laborJson.length > 0) {
          for (const row of laborJson) {
            await client.query(
              `INSERT INTO job_labor (job_id, description, hours, rate, total)
               VALUES ($1, $2, $3, $4, $5)`,
              [jobId, row.description, row.hours, row.rate, row.total]
            );
          }
        }

        await client.query("COMMIT");

        logAuditEvent(req, "Job Creation", "job", result.rows[0].id, null, {
            job: result.rows[0]
        });

        // Emit event and queue notifications (safe - doesn't break business logic)
        const event = await eventService.emitEvent({
            eventType: eventService.EVENT_TYPES.JOB_CREATED,
            entityType: "job",
            entityId: result.rows[0].id,
            payload: {
                customer_name: result.rows[0].customer_name,
                job_card_no: result.rows[0].job_card_no,
                sales_area: result.rows[0].sales_area,
                service_type: result.rows[0].service_type,
                engineer_id: userId,
            },
            createdBy: userId,
            client,
        });

        if (event) {
            await eventService.queueNotification({
                eventId: event.id,
                notificationType: eventService.NOTIFICATION_TYPES.JOB_APPROVAL_NEEDED,
                recipientRole: "manager",
                client,
            });
        }

        req.logger.info("Job created successfully", {
          eventType: "job_creation",
          jobId: result.rows[0].id,
          engineerId: userId,
        });
        return sendSuccess(res, { id: result.rows[0].id, ...result.rows[0] });

    } catch (err) {
        await client.query("ROLLBACK");
        req.logger.error("Failed to create job", {
          eventType: "job_creation",
          error: err.message,
          stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
        });
        return sendError(res, 500, "Failed to create job", err.message);
    } finally {
        client.release();
    }
  })
);

// ─── GET /jobs ────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /jobs:
 *   get:
 *     summary: Get list of jobs with pagination
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination
 *     responses:
 *       200:
 *         description: List of jobs
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       customer_name:
 *                         type: string
 *                       equipment_name:
 *                         type: string
 *                       status:
 *                         type: string
 *                         enum: [WAITING_PRICING, APPROVED, REJECTED, CLOSED]
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                       job_card_no:
 *                         type: string
 *                       sales_area:
 *                         type: string
 *                       service_type:
 *                         type: string
 *                       grand_total:
 *                         type: number
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// Returns list/dashboard data with pagination and the latest pricing total.
app.get(
  "/jobs",
  requireAuth,
  asyncHandler(async (req, res) => {
    const page = Math.max(1, toNum(req.query.page, 1));
    const limit = 10;
    const offset = (page - 1) * limit;

    let query = `
            SELECT 
                jm.id,
                jm.customer_name,
                jm.equipment_name,
                jm.status,
                jm.created_at,
                jm.job_card_no,
                jm.sales_area,
                jm.service_type,
                ph.grand_total
             FROM job_master jm
             LEFT JOIN pricing_header ph 
             ON jm.id = ph.job_id
        `;
    let values = [limit, offset];
    let whereClause = '';

    if (req.user.role === "engineer") {
      whereClause = ' WHERE jm.engineer_id = $3';
      values.push(req.user.id);
    }

    query += whereClause + ' ORDER BY jm.created_at DESC LIMIT $1 OFFSET $2';

    const result = await pool.query(query, values);
    return sendSuccess(res, result.rows ?? []);
  })
);

// ─── GET /jobs/:id ────────────────────────────────────────────────────────────
/**
 * @swagger
 * /jobs/{id}:
 *   get:
 *     summary: Get job details by ID
 *     tags: [Jobs]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Job ID
 *     responses:
 *       200:
 *         description: Job details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       400:
 *         description: Invalid job ID
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Job not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// Returns full job details for editing with parts and labor data.
app.get(
  "/jobs/:id",
  requireAuth,
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    req.logger.info("Get job by id", {
      eventType: "job_read",
      jobId: id,
    });

    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError("Invalid job id", 400, "INVALID_JOB_ID");
    }

    const client = await pool.connect();
    try {
      const jobResult = await client.query(
          `SELECT
                id,
                customer_name,
                equipment_name,
                job_card_no,
                job_date,
                ref_no,
                customer_code,
                attention_of,
                email,
                contact_no,
                sales_area,
                service_type,
                under_warranty,
                status,
                job_data
             FROM job_master
             WHERE id = $1`,
          [id]
      );

      if (jobResult.rows.length === 0) {
        throw new AppError("Job not found", 404, "JOB_NOT_FOUND");
      }

      const [partsResult, laborResult] = await Promise.all([
          client.query("SELECT * FROM job_parts WHERE job_id = $1 ORDER BY id", [id]),
          client.query("SELECT * FROM job_labor WHERE job_id = $1 ORDER BY id", [id])
      ]);

      return sendSuccess(res, {
        job: jobResult.rows[0],
        parts: partsResult.rows || [],
        labor: laborResult.rows || [],
      });
    } finally {
      client.release();
    }
  })
);

app.put(
  "/jobs/:id",
  requireAuth,
  requireRole("engineer", "manager", "admin"),
  validate({ params: idParamSchema, body: jobUpdateSchema }),
  asyncHandler(async (req, res) => {
    const jobId = Number(req.params.id);
    if (!Number.isInteger(jobId) || jobId <= 0) {
      throw new AppError("Invalid job id", 400, "INVALID_JOB_ID");
    }

    const jobResult = await pool.query(
      "SELECT id, status, engineer_id FROM job_master WHERE id = $1",
      [jobId]
    );
    if (jobResult.rows.length === 0) {
      throw new AppError("Job not found", 404, "JOB_NOT_FOUND");
    }

    const job = jobResult.rows[0];
    if (job.status === "APPROVED" || job.status === "CLOSED") {
      throw new AppError("Finalized jobs cannot be modified", 400, "JOB_FINALIZED");
    }

    if (req.user.role === "engineer" && job.engineer_id !== req.user.id) {
      throw new AppError("Engineers can only update their own jobs", 403, "FORBIDDEN");
    }

    const updates = [];
    const values = [];
    let index = 1;

    const allowedUpdateFields = [
      "customer_name",
      "equipment_name",
      "job_card_no",
      "job_date",
      "ref_no",
      "sales_area",
      "service_type",
      "under_warranty",
      "customer_code",
      "attention_of",
      "email",
      "contact_no",
      "other_expenses",
      "discount_percentage",
      "job_data",
    ];

    for (const field of allowedUpdateFields) {
      if (field in req.body) {
        updates.push(`${field} = $${index}`);
        values.push(field === "job_data" ? req.body[field] : req.body[field]);
        index += 1;
      }
    }

    if (updates.length === 0) {
      throw new AppError("No updatable fields were provided", 400, "NO_UPDATE_FIELDS");
    }

    updates.push("updated_at = CURRENT_TIMESTAMP", `updated_by = $${index}`);
    values.push(req.user.id);
    values.push(jobId);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const updateQuery = `UPDATE job_master SET ${updates.join(", ")} WHERE id = $${values.length} RETURNING *`;
      const updatedResult = await client.query(updateQuery, values);
      const updatedJob = updatedResult.rows[0];

      if (Array.isArray(req.body.parts)) {
        await client.query("DELETE FROM job_parts WHERE job_id = $1", [jobId]);
        for (const part of req.body.parts) {
          const mappedPart = mapPart(part);
          await client.query(
            `INSERT INTO job_parts (job_id, part_name, quantity, unit_price, total)
             VALUES ($1, $2, $3, $4, $5)`,
            [jobId, mappedPart.part_name, mappedPart.quantity, mappedPart.unit_price, mappedPart.total]
          );
        }
      }

      if (Array.isArray(req.body.labor)) {
        await client.query("DELETE FROM job_labor WHERE job_id = $1", [jobId]);
        for (const laborRow of req.body.labor) {
          const mappedLabor = mapLabor(laborRow);
          await client.query(
            `INSERT INTO job_labor (job_id, description, hours, rate, total)
             VALUES ($1, $2, $3, $4, $5)`,
            [jobId, mappedLabor.description, mappedLabor.hours, mappedLabor.rate, mappedLabor.total]
          );
        }
      }

      await client.query("COMMIT");

      logAuditEvent(req, "Job Update", "job", jobId, job, updatedJob);
      return sendSuccess(res, updatedJob, "Job updated successfully");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  })
);

/**
 * @swagger
 * /jobs/{id}/pricing:
 *   post:
 *     summary: Submit or update pricing for a job
 *     tags: [Pricing]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Job ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               labour_rate:
 *                 type: number
 *               service_charge:
 *                 type: number
 *               discount:
 *                 type: number
 *               vat_percent:
 *                 type: number
 *               parts_total:
 *                 type: number
 *               labour_total:
 *                 type: number
 *               taxable_amount:
 *                 type: number
 *               vat_amount:
 *                 type: number
 *               grand_total:
 *                 type: number
 *     responses:
 *       200:
 *         description: Pricing submitted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       400:
 *         description: Invalid request or finalized job
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden - engineer role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Job not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// ─── POST /jobs/:id/pricing ───────────────────────────────────────────────────
// Upserts pricing for a job: deletes any existing pricing row, then inserts a
// fresh one. This keeps pricing_header at one row per job and prevents stale
// accumulation. Approval is a separate step.
app.post(
  "/jobs/:id/pricing",
  requireAuth,
  requireRole("engineer", "manager", "admin"),
  validate({ params: idParamSchema, body: pricingSchema }),
  asyncHandler(async (req, res) => {
    const jobId = Number(req.params.id);
    if (!Number.isInteger(jobId) || jobId <= 0) {
      throw new AppError("Invalid job id", 400, "INVALID_JOB_ID");
    }

    const jobCheck = await pool.query(
      "SELECT id, status FROM job_master WHERE id = $1",
      [jobId]
    );
    if (jobCheck.rows.length === 0) {
      throw new AppError("Job not found", 404, "JOB_NOT_FOUND");
    }
    if (jobCheck.rows[0].status === "APPROVED" || jobCheck.rows[0].status === "CLOSED") {
      throw new AppError("Cannot update pricing for a finalized job", 400, "JOB_FINALIZED");
    }

    const body = req.body ?? {};
    const labour_rate = toNum(body.labour_rate);
    const service_charge = toNum(body.service_charge);
    const discount = toNum(body.discount);
    const vat_percent = toNum(body.vat_percent, 5);
    const parts_total = toNum(body.parts_total);
    const labour_total = toNum(body.labour_total);
    const taxable_amount = toNum(body.taxable_amount);
    const vat_amount = toNum(body.vat_amount);
    const grand_total = toNum(body.grand_total);

    const numericFields = {
      labour_rate,
      service_charge,
      discount,
      parts_total,
      labour_total,
      taxable_amount,
      vat_amount,
      grand_total,
    };
    for (const [field, val] of Object.entries(numericFields)) {
      if (val < 0) {
        throw new AppError(`${field} cannot be negative`, 400, "INVALID_PRICING_VALUE");
      }
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const oldPricingResult = await client.query(
        "SELECT * FROM pricing_header WHERE job_id = $1 ORDER BY created_at DESC LIMIT 1",
        [jobId]
      );
      const oldPricing = oldPricingResult.rows[0] ?? null;

      await client.query("DELETE FROM pricing_header WHERE job_id = $1", [jobId]);

      const result = await client.query(
        `INSERT INTO pricing_header
                    (job_id, labour_rate, service_charge, discount, vat_percent,
                     parts_total, labour_total, taxable_amount, vat_amount, grand_total)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                 RETURNING *`,
        [
          jobId,
          labour_rate,
          service_charge,
          discount,
          vat_percent,
          parts_total,
          labour_total,
          taxable_amount,
          vat_amount,
          grand_total,
        ]
      );

      await client.query("COMMIT");
      logAuditEvent(req, "Pricing Update", "pricing", jobId, oldPricing, result.rows[0]);

      // Emit event and queue notifications (safe - doesn't break business logic)
      const event = await eventService.emitEvent({
        eventType: eventService.EVENT_TYPES.PRICING_SUBMITTED,
        entityType: "job",
        entityId: jobId,
        payload: {
          grand_total: result.rows[0].grand_total,
          parts_total: result.rows[0].parts_total,
          labour_total: result.rows[0].labour_total,
          submitted_by: req.user?.id,
        },
        createdBy: req.user?.id,
        client,
      });

      if (event) {
        await eventService.queueNotification({
          eventId: event.id,
          notificationType: eventService.NOTIFICATION_TYPES.PRICING_SUBMITTED,
          recipientRole: "manager",
          client,
        });
      }

      return sendSuccess(res, result.rows[0]);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  })
);

/**
 * @swagger
 * /jobs/{id}/status:
 *   put:
 *     summary: Update job status (manager only)
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Job ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [WAITING_PRICING, APPROVED, REJECTED, CLOSED]
 *     responses:
 *       200:
 *         description: Job status updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       400:
 *         description: Invalid request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden - manager role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Job not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// Updates job status. Backend is the source of truth.
// APPROVED and CLOSED jobs are immutable.
// Approval requires a pricing row with grand_total > 0.
app.put(
  "/jobs/:id/status",
  requireAuth,
  requireRole("manager"),
  validate({ params: idParamSchema, body: statusUpdateSchema }),
  asyncHandler(async (req, res) => {
    const jobId = Number(req.params.id);
    if (!Number.isInteger(jobId) || jobId <= 0) {
      throw new AppError("Invalid job id", 400, "INVALID_JOB_ID");
    }

    const { status } = req.body ?? {};
    if (!status) {
      throw new AppError("status is required", 400, "STATUS_REQUIRED");
    }
    if (!ALLOWED_STATUSES.includes(status)) {
      throw new AppError(
        `status must be one of: ${ALLOWED_STATUSES.join(", ")}`,
        400,
        "INVALID_STATUS"
      );
    }

    req.logger.info("Attempting job update", {
      eventType: "job_update",
      jobId,
    });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const jobResult = await client.query(
        `SELECT id, status, engineer_id, customer_name, job_card_no, job_date,
                ref_no, sales_area, service_type, under_warranty
         FROM job_master
         WHERE id = $1`,
        [jobId]
      );
      if (jobResult.rows.length === 0) {
        throw new AppError("Job not found", 404, "JOB_NOT_FOUND");
      }

      const job = jobResult.rows[0];
      const currentStatus = job.status;

      if (currentStatus === "APPROVED") {
        throw new AppError("Approved jobs cannot be modified", 400, "JOB_APPROVED");
      }

      if (currentStatus === "CLOSED") {
        throw new AppError(
          `Job is already ${currentStatus} and cannot be changed`,
          400,
          "JOB_CLOSED"
        );
      }

      let pricingResult = null;
      if (status === "APPROVED") {
        pricingResult = await client.query(
          "SELECT * FROM pricing_header WHERE job_id = $1 ORDER BY created_at DESC LIMIT 1",
          [jobId]
        );
        if (pricingResult.rows.length === 0) {
          throw new AppError("Cannot approve job without pricing", 400, "MISSING_PRICING");
        }
        if (toNum(pricingResult.rows[0].grand_total) <= 0) {
          throw new AppError(
            "Cannot approve job: grand_total must be greater than 0",
            400,
            "INVALID_PRICING_TOTAL"
          );
        }

        const manager = await signatureService.getUserSignature(req.user.id);
        if (!manager?.signature_url) {
          throw new AppError(
            "Manager signature is required for approval",
            400,
            "MANAGER_SIGNATURE_REQUIRED"
          );
        }

        const engineer = job.engineer_id
          ? await signatureService.getUserSignature(job.engineer_id)
          : null;

        const approvalSnapshot = pdfGovernanceService.generateApprovalSnapshot({
          job: { ...job, status },
          pricing: pricingResult.rows[0],
          manager,
          engineer,
          approvedAt: new Date(),
        });

        const approvedDocument = await pdfGovernanceService.createApprovedDocumentRecord({
          client,
          jobId,
          pdfUrl: null,
          pdfHash: null,
          generatedBy: req.user.id,
          snapshot: approvalSnapshot,
        });

        if (process.env.NODE_ENV === "development") {
          req.logger.info("Approval snapshot created", {
            eventType: "pdf_generation",
            jobId,
          });
          req.logger.info("Final document locked", {
            eventType: "pdf_generation",
            jobId,
          });
        }

        req.approvedDocument = approvedDocument;
      }

      const fields = ["status = $1", "updated_at = NOW()", "updated_by = $2"];
      const values = [status, req.user.id];
      if (status === "APPROVED") {
        fields.push("approved_by_id = $3", "approved_at = CURRENT_TIMESTAMP");
        values.push(req.user.id);
      }
      values.push(jobId);
      const whereParam = values.length;

      const updated = await client.query(
        `UPDATE job_master SET ${fields.join(", ")} WHERE id = $${whereParam} RETURNING *`,
        values
      );

      await client.query("COMMIT");

      const actionType = status === "APPROVED"
        ? "Job Approval"
        : status === "CLOSED"
          ? "Job Closure"
          : "Status Change";

      logAuditEvent(req, actionType, "job", jobId, { status: currentStatus }, { status });

      // Emit event and queue notifications (safe - doesn't break business logic)
      let eventType;
      if (status === "APPROVED") {
        eventType = eventService.EVENT_TYPES.JOB_APPROVED;
      } else if (status === "CLOSED") {
        eventType = eventService.EVENT_TYPES.JOB_CLOSED;
      }

      if (eventType) {
        const event = await eventService.emitEvent({
          eventType,
          entityType: "job",
          entityId: jobId,
          payload: {
            previous_status: currentStatus,
            new_status: status,
            customer_name: job.customer_name,
            job_card_no: job.job_card_no,
            sales_area: job.sales_area,
            service_type: job.service_type,
            engineer_id: job.engineer_id,
            approved_by: req.user.id,
          },
          createdBy: req.user.id,
          client,
        });

        if (event) {
          const notificationType = status === "APPROVED"
            ? eventService.NOTIFICATION_TYPES.JOB_APPROVED
            : eventService.NOTIFICATION_TYPES.JOB_CLOSED;

          await eventService.queueNotification({
            eventId: event.id,
            notificationType,
            recipientUserId: job.engineer_id,
            client,
          });
        }
      }

      if (status === "APPROVED") {
        const approvalJob = { ...job, status };
        const zohoNote = await openAiService.generateZohoNote({
          job: approvalJob,
          pricing: pricingResult?.rows[0] ?? {},
          manager: req.user ? { id: req.user.id, role: req.user.role } : null,
          engineer: job.engineer_id ? await signatureService.getUserSignature(job.engineer_id) : null,
        });

        const n8nResult = await n8nService.triggerN8nWorkflow("job_approved", {
          job: approvalJob,
          pricing: pricingResult?.rows[0] ?? null,
          manager: { id: req.user.id, role: req.user.role },
          engineer: { id: job.engineer_id ?? null },
          zoho_note: zohoNote?.note ?? null,
          approved_at: new Date().toISOString(),
        });

        req.logger.debug("n8n approval webhook result", {
          eventType: "n8n",
          result: n8nResult,
        });
      }

      return sendSuccess(res, req.approvedDocument ? { ...updated.rows[0], approvedDocument: req.approvedDocument } : updated.rows[0]);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  })
);

// ─── Auth routes ──────────────────────────────────────────────────────────────

// POST /auth/login
/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Authenticate user and issue JWT tokens
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Authentication successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       400:
 *         description: Missing credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.post(
  "/auth/login",
  authLimiter,
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body ?? {};

    if (!email || !password) {
      throw new AppError("Email and password are required", 400, "AUTH_MISSING_CREDENTIALS");
    }

    const userResult = await pool.query(
      "SELECT id, name, email, password_hash, role, signature_url FROM users WHERE email = $1 AND is_active = true",
      [email]
    );

    if (userResult.rows.length === 0) {
      logAuditEvent(req, "Login Failure", "auth", null, null, {
        email,
        reason: "Invalid email or password",
      });
      throw new AppError("Invalid email or password", 401, "AUTH_INVALID_CREDENTIALS");
    }

    const user = userResult.rows[0];
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      logAuditEvent(req, "Login Failure", "auth", user.id, null, {
        email,
        reason: "Invalid email or password",
      });
      throw new AppError("Invalid email or password", 401, "AUTH_INVALID_CREDENTIALS");
    }

    const accessToken = generateToken(user);
    const refreshToken = tokenService.generateRefreshToken();
    const createdByIp = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || null;
    const userAgent = req.headers["user-agent"] || null;

    await tokenService.storeRefreshToken({
      userId: user.id,
      token: refreshToken,
      createdByIp,
      userAgent,
    });

    logAuditEvent(req, "Login Success", "auth", user.id, null, {
      email: user.email,
      role: user.role,
    });

    // Emit event and queue notifications (safe - doesn't break business logic)
    const event = await eventService.emitEvent({
      eventType: eventService.EVENT_TYPES.USER_LOGIN,
      entityType: "user",
      entityId: user.id,
      payload: {
        role: user.role,
        login_ip: createdByIp,
        user_agent: userAgent,
      },
      createdBy: user.id,
    });

    if (event) {
      await eventService.queueNotification({
        eventId: event.id,
        notificationType: eventService.NOTIFICATION_TYPES.USER_LOGIN,
        recipientRole: "admin",
      });
    }

    return sendSuccess(
      res,
      {
        token: accessToken,
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          signature_url: user.signature_url,
        },
      },
      200
    );
  })
);

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Rotate a refresh token and issue a new access token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Invalid refresh token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.post(
  "/auth/refresh",
  validate({ body: refreshTokenSchema }),
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body ?? {};
    const refreshTokenHash = tokenService.hashToken(refreshToken);
    const tokenRecord = await tokenService.findRefreshTokenByHash(refreshTokenHash);

    if (
      !tokenRecord ||
      tokenRecord.revoked_at ||
      new Date(tokenRecord.expires_at) <= new Date()
    ) {
      logAuditEvent(req, "Invalid Refresh Attempt", "auth", tokenRecord?.user_id ?? null, null, {
        reason: "Refresh token is invalid, expired, or revoked",
      });
      throw new AppError("Invalid refresh token", 401, "INVALID_REFRESH_TOKEN");
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { refreshToken: newRefreshToken } = await tokenService.rotateRefreshToken({
        oldTokenHash: refreshTokenHash,
        userId: tokenRecord.user_id,
        createdByIp: req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || null,
        userAgent: req.headers["user-agent"] || null,
        client,
      });

      await client.query("COMMIT");

      const user = {
        id: tokenRecord.user_id,
        name: tokenRecord.user_name,
        email: tokenRecord.user_email,
        role: tokenRecord.user_role,
      };
      const accessToken = generateToken(user);

      logAuditEvent(req, "Token Refresh", "auth", user.id, null, {
        refresh_token_id: tokenRecord.id,
      });

      // Emit event and queue notifications (safe - doesn't break business logic)
      const event = await eventService.emitEvent({
        eventType: eventService.EVENT_TYPES.TOKEN_REFRESH,
        entityType: "user",
        entityId: user.id,
        payload: {
          old_token_id: tokenRecord.id,
          new_token_id: null, // Will be set by rotateRefreshToken
          refresh_ip: req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || null,
          user_agent: req.headers["user-agent"] || null,
        },
        createdBy: user.id,
      });

      if (event) {
        await eventService.queueNotification({
          eventId: event.id,
          notificationType: eventService.NOTIFICATION_TYPES.TOKEN_REFRESH,
          recipientRole: "admin",
        });
      }

      return sendSuccess(res, {
        token: accessToken,
        accessToken,
        refreshToken: newRefreshToken,
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  })
);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Revoke a refresh token and log the user out
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Logout successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Invalid refresh token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.post(
  "/auth/logout",
  validate({ body: logoutSchema }),
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body ?? {};
    const tokenHash = tokenService.hashToken(refreshToken);
    const tokenRecord = await tokenService.findRefreshTokenByHash(tokenHash);

    if (!tokenRecord || tokenRecord.revoked_at) {
      logAuditEvent(req, "Invalid Refresh Attempt", "auth", tokenRecord?.user_id ?? null, null, {
        reason: "Logout token invalid or already revoked",
      });
      return sendSuccess(res, { message: "Logged out" });
    }

    await tokenService.revokeRefreshTokenByHash(tokenHash);
    logAuditEvent(req, "Logout", "auth", tokenRecord.user_id, null, {
      user_agent: req.headers["user-agent"] || null,
      ip_address: req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || null,
    });

    // Emit event and queue notifications (safe - doesn't break business logic)
    const event = await eventService.emitEvent({
      eventType: eventService.EVENT_TYPES.USER_LOGOUT,
      entityType: "user",
      entityId: tokenRecord.user_id,
      payload: {
        logout_ip: req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || null,
        user_agent: req.headers["user-agent"] || null,
      },
      createdBy: tokenRecord.user_id,
    });

    if (event) {
      await eventService.queueNotification({
        eventId: event.id,
        notificationType: eventService.NOTIFICATION_TYPES.USER_LOGOUT,
        recipientRole: "admin",
      });
    }

    return sendSuccess(res, { message: "Logged out" });
  })
);

// DEV ONLY - this endpoint is for development/testing only.
// Production user creation must be admin-controlled.
app.post(
  "/auth/dev-create-user",
  authLimiter,
  requireDevOrAdmin,
  validate({ body: userCreationSchema }),
  asyncHandler(async (req, res) => {
    const { name, email, password, role, signature_url } = req.body ?? {};

    if (!name || !email || !password || !role) {
      throw new AppError("Name, email, password, and role are required", 400, "USER_CREATION_MISSING_FIELDS");
    }

    if (!["engineer", "manager", "admin"].includes(role)) {
      throw new AppError("Role must be one of: engineer, manager, admin", 400, "USER_CREATION_INVALID_ROLE");
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, signature_url)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, name, email, role, signature_url, created_at`,
      [name, email, hashedPassword, role, signature_url]
    );

    logAuditEvent(req, "Dev User Created", "user", result.rows[0].id, null, {
      email: result.rows[0].email,
      role: result.rows[0].role,
      created_at: result.rows[0].created_at,
    });

    return sendSuccess(res, result.rows[0]);
  })
);

// ─── Signature upload routes ──────────────────────────────────────────────────
/**
 * POST /signatures/manager
 * Manager signs and uploads signature file (image)
 * Content-Type: multipart/form-data
 * Body: { signature: <file> }
 */
/**
 * @swagger
 * /signatures/manager:
 *   post:
 *     summary: Upload manager signature file
 *     tags: [Signatures]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               signature:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Signature uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.post(
  "/signatures/manager",
  requireAuth,
  requireRole("manager"),
  (req, res, next) => {
    signatureUpload(req, res, (err) => {
      if (err) {
        req.logger.warn("Signature upload failed", {
          eventType: "upload",
          error: err.message,
        });
        return sendError(res, 400, err.message);
      }
      next();
    });
  },
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new AppError("No file provided", 400);
    }

    // Generate secure filename (preserve existing logic)
    const filename = generateSecureFilename(req.user.id, "signature", req.file.originalname);

    // Upload file using storage service
    const uploadResult = await storageService.uploadFile(req.file.buffer, filename, "signature");
    if (uploadResult.error) {
      throw new AppError(uploadResult.error, 400);
    }

    // Get existing signature for audit
    const existing = await signatureService.getUserSignature(req.user.id);

    // Update user signature metadata
    const updated = await signatureService.upsertUserSignature({
      userId: req.user.id,
      signature_url: uploadResult.url,
    });

    if (process.env.NODE_ENV === "development") {
      req.logger.info("Manager signature uploaded", {
        eventType: "upload",
        filepath: uploadResult.filepath,
      });
    }

    logAuditEvent(req, "Signature Upload", "user", req.user.id, {
      signature_url: existing?.signature_url ?? null,
    }, {
      signature_url: updated.signature_url,
      upload_path: uploadResult.filepath,
      file_size: req.file.size,
    });

    // Emit event and queue notifications (safe - doesn't break business logic)
    const event = await eventService.emitEvent({
      eventType: eventService.EVENT_TYPES.SIGNATURE_UPLOADED,
      entityType: "user",
      entityId: req.user.id,
      payload: {
        role: "manager",
        signature_url: updated.signature_url,
        uploaded_at: updated.signature_uploaded_at,
      },
      createdBy: req.user.id,
    });

    if (event) {
      await eventService.queueNotification({
        eventId: event.id,
        notificationType: eventService.NOTIFICATION_TYPES.SIGNATURE_UPLOADED,
        recipientRole: "admin",
      });
    }

    return sendSuccess(res, updated);
  })
);

/**
 * POST /signatures/engineer
 * Engineer signs and uploads signature file (image)
 * Content-Type: multipart/form-data
 * Body: { signature: <file> }
 */
/**
 * @swagger
 * /signatures/engineer:
 *   post:
 *     summary: Upload engineer signature file
 *     tags: [Signatures]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               signature:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Signature uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.post(
  "/signatures/engineer",
  requireAuth,
  requireRole("engineer"),
  (req, res, next) => {
    signatureUpload(req, res, (err) => {
      if (err) {
        req.logger.warn("Signature upload failed", {
          eventType: "upload",
          error: err.message,
        });
        return sendError(res, 400, err.message);
      }
      next();
    });
  },
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new AppError("No file provided", 400);
    }

    // Generate secure filename (preserve existing logic)
    const filename = generateSecureFilename(req.user.id, "signature", req.file.originalname);

    // Upload file using storage service
    const uploadResult = await storageService.uploadFile(req.file.buffer, filename, "signature");
    if (uploadResult.error) {
      throw new AppError(uploadResult.error, 400);
    }

    // Get existing signature for audit
    const existing = await signatureService.getUserSignature(req.user.id);

    // Update user signature metadata
    const updated = await signatureService.upsertUserSignature({
      userId: req.user.id,
      signature_url: uploadResult.url,
    });

    if (process.env.NODE_ENV === "development") {
      req.logger.info("Engineer signature uploaded", {
        eventType: "upload",
        filepath: uploadResult.filepath,
      });
    }

    logAuditEvent(req, "Signature Upload", "user", req.user.id, {
      signature_url: existing?.signature_url ?? null,
    }, {
      signature_url: updated.signature_url,
      upload_path: uploadResult.filepath,
      file_size: req.file.size,
    });

    // Emit event and queue notifications (safe - doesn't break business logic)
    const event = await eventService.emitEvent({
      eventType: eventService.EVENT_TYPES.SIGNATURE_UPLOADED,
      entityType: "user",
      entityId: req.user.id,
      payload: {
        role: "engineer",
        signature_url: updated.signature_url,
        uploaded_at: updated.signature_uploaded_at,
      },
      createdBy: req.user.id,
    });

    if (event) {
      await eventService.queueNotification({
        eventId: event.id,
        notificationType: eventService.NOTIFICATION_TYPES.SIGNATURE_UPLOADED,
        recipientRole: "admin",
      });
    }

    return sendSuccess(res, updated);
  })
);

app.get(
  "/approved-documents/job/:id",
  requireAuth,
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const jobId = Number(req.params.id);
    const documents = await pdfGovernanceService.getApprovedDocumentsByJob(jobId);
    return sendSuccess(res, documents);
  })
);

/**
 * POST /approved-documents
 * Upload an approved PDF document
 * Content-Type: multipart/form-data
 * Body: { document: <file>, job_id: <number> }
 * Requires: manager role
 */
/**
 * @swagger
 * /approved-documents:
 *   post:
 *     summary: Upload an approved PDF document for an approved job
 *     tags: [ApprovedDocuments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               document:
 *                 type: string
 *                 format: binary
 *               job_id:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Approved document uploaded
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.post(
  "/approved-documents",
  requireAuth,
  requireRole("manager"),
  (req, res, next) => {
    documentUpload(req, res, (err) => {
      if (err) {
        if (process.env.NODE_ENV === "development") {
          req.logger.warn("Document upload failed", {
            eventType: "upload",
            error: err.message,
          });
        }
        return sendError(res, 400, err.message);
      }
      next();
    });
  },
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new AppError("No PDF file provided", 400);
    }

    const jobId = Number(req.body.job_id);
    if (!jobId || isNaN(jobId)) {
      throw new AppError("Invalid job_id", 400);
    }

    // Verify job exists and user has access
    const jobResult = await pool.query(
      "SELECT id, status, approved_by FROM job_master WHERE id = $1",
      [jobId]
    );
    if (jobResult.rows.length === 0) {
      throw new AppError("Job not found", 404);
    }

    const job = jobResult.rows[0];
    if (job.status !== "APPROVED") {
      throw new AppError("Job must be in APPROVED status to upload documents", 400);
    }

    // Generate secure filename (preserve existing logic)
    const filename = generateSecureFilename(req.user.id, "document", req.file.originalname);

    // Upload file using storage service
    const uploadResult = await storageService.uploadFile(req.file.buffer, filename, "document");
    if (uploadResult.error) {
      throw new AppError(uploadResult.error, 400);
    }

    const managerSignature = await signatureService.getUserSignature(req.user.id);
    const approvalSnapshot = pdfGovernanceService.generateApprovalSnapshot({
      job: {
        ...job,
        status: job.status,
      },
      pricing: null,
      manager: managerSignature,
      engineer: null,
      approvedAt: new Date(),
    });

    const docResult = await pool.query(
      `INSERT INTO approved_documents 
       (job_id, pdf_url, pdf_hash, generated_by, is_locked, approval_snapshot)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        jobId,
        uploadResult.url,
        uploadResult.filepath,
        req.user.id,
        true,
        JSON.stringify(approvalSnapshot),
      ]
    );

    const document = docResult.rows[0];

    if (process.env.NODE_ENV === "development") {
      req.logger.info("Approved document uploaded", {
        eventType: "upload",
        filepath: uploadResult.filepath,
      });
    }

    logAuditEvent(req, "Approved Document Upload", "job", jobId, {}, {
      document_id: document.id,
      upload_path: uploadResult.filepath,
      file_size: uploadResult.size,
      is_locked: true,
    });

    return sendSuccess(res, document, 201);
  })
);

// ─── Start server ─────────────────────────────────────────────────────────────
// Validate access token secret before starting
if (!process.env.ACCESS_TOKEN_SECRET && !process.env.JWT_SECRET) {
    logger.error("FATAL: ACCESS_TOKEN_SECRET or JWT_SECRET environment variable is required", {
      eventType: "startup",
    });
    logger.error("FATAL: ACCESS_TOKEN_SECRET or JWT_SECRET environment variable is required", {
      eventType: "startup",
    });
    logger.error("Please add ACCESS_TOKEN_SECRET or JWT_SECRET to .env file", {
      eventType: "startup",
    });
    process.exit(1);
}

app.use(errorHandler);

// Log authentication secret status
logger.info("Access token secret is configured", {
  eventType: "startup",
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
    logger.info(`Server running on port ${PORT}`, {
      eventType: "startup",
      port: PORT,
      environment: process.env.NODE_ENV || "development",
    });

    // Start background workers
    try {
      await workerManager.start();
    } catch (error) {
      logger.error("Failed to start worker manager", {
        eventType: "startup",
        error: error.message,
      });
      // Don't crash the server if workers fail to start
    }
});