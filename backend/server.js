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
import * as pricingService from "./services/pricingService.js";
import {
  JOB_STATUSES,
  canTransition,
  normalizeStatus,
  validateJobReadyForApproval,
} from "./services/jobWorkflowService.js";
import {
  loginSchema,
  refreshTokenSchema,
  logoutSchema,
  jobCreationSchema,
  jobUpdateSchema,
  pricingSchema,
  statusUpdateSchema,
  deleteJobSchema,
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

const sendError = (res, statusCode, message, code = "INTERNAL_ERROR", details = []) => {
    return res.status(statusCode).json({
        success: false,
        error: {
            code,
            message,
            details: Array.isArray(details) ? details : [],
        },
    });
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

const resolveUserIdByName = async (role, userName) => {
  if (!userName || typeof userName !== "string") return null;
  const res = await pool.query(
    "SELECT id FROM users WHERE role = $1 AND LOWER(name) = LOWER($2) LIMIT 1",
    [role, userName.trim()]
  );
  return res.rows[0]?.id ?? null;
};

const resolveUserIdById = async (role, id) => {
  if (!Number.isInteger(id) || id <= 0) return null;
  const res = await pool.query(
    "SELECT id FROM users WHERE role = $1 AND id = $2 LIMIT 1",
    [role, id]
  );
  return res.rows[0]?.id ?? null;
};

const resolveManagerIdByName = async (managerName) => resolveUserIdByName("manager", managerName);
const resolveEngineerIdByName = async (engineerName) => resolveUserIdByName("engineer", engineerName);

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
app.get("/health", async (req, res) => {
  res.json({
    success: true,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

app.get(
  "/users/managers",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const result = await pool.query(
      "SELECT id, name FROM users WHERE role = 'manager' ORDER BY name"
    );
    return sendSuccess(res, result.rows ?? []);
  })
);

app.get(
  "/users/engineers",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const result = await pool.query(
      "SELECT id, name FROM users WHERE role = 'engineer' ORDER BY name"
    );
    return sendSuccess(res, result.rows ?? []);
  })
);

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
  requireRole("engineer", "manager"),
  (req, res, next) => {
    if (req.body) {
      if (req.body.email) {
        req.body.email = req.body.email.trim().toLowerCase();
      }
      if (req.body.email === "") {
        req.body.email = undefined;
      }
    }
    next();
  },
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
    const equipment_model = req.body?.equipment_model || null;
    const equipment_brand_description = req.body?.equipment_brand_description || null;
    const equipment_part_no = req.body?.equipment_part_no || null;
    const equipment_serial_no = req.body?.equipment_serial_no || null;
    const equipment_year = req.body?.equipment_year || null;
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
    function sanitizeJson(value) {
      return JSON.parse(JSON.stringify(value));
    }

    const safeParts = sanitizeJson(partsJson);
    const safeLabor = sanitizeJson(laborJson);
    const safeJobData = {
      ...sanitizeJson(typeof req.body?.job_data === "object" && req.body.job_data ? req.body.job_data : {}),
      parts: safeParts,
      labor: safeLabor,
      compressor_checklist: sanitizeJson(req.body?.compressor_checklist ?? []),
      dryer_checklist: sanitizeJson(req.body?.dryer_checklist ?? []),
    };


    // ONLY validation: customer_name and equipment_name are required
    if (!customer_name) {
        return sendError(res, 400, "Customer name is required");
    }
    if (!equipment_name) {
        return sendError(res, 400, "Equipment name is required");
    }

    const managerIdPayload = req.body?.manager_id ?? req.body?.job_data?.manager_id;
    const managerName = req.body?.manager_name || req.body?.job_data?.manager_name || null;
    let manager_id = null;
    if (managerIdPayload !== undefined && managerIdPayload !== null) {
      const requestedManagerId = Number(managerIdPayload);
      if (!Number.isInteger(requestedManagerId) || requestedManagerId <= 0) {
        throw new AppError("manager_id must be a positive integer", 400, "INVALID_MANAGER_ID");
      }
      manager_id = await resolveUserIdById("manager", requestedManagerId);
      if (!manager_id) {
        throw new AppError("Selected manager not found", 400, "MANAGER_NOT_FOUND");
      }
    } else if (managerName) {
      manager_id = await resolveManagerIdByName(managerName);
      if (!manager_id) {
        throw new AppError("Selected manager not found", 400, "MANAGER_NOT_FOUND");
      }
    }

    const engineerIdPayload = req.body?.engineer_id ?? req.body?.job_data?.engineer_id;
    let engineer_id = userId;
    if (engineerIdPayload !== undefined && engineerIdPayload !== null) {
      const requestedEngineerId = Number(engineerIdPayload);
      if (!Number.isInteger(requestedEngineerId) || requestedEngineerId <= 0) {
        throw new AppError("engineer_id must be a positive integer", 400, "INVALID_ENGINEER_ID");
      }
      if (req.user.role === "engineer" && requestedEngineerId !== req.user.id) {
        throw new AppError("Engineers can only assign jobs to themselves", 403, "FORBIDDEN");
      }
      engineer_id = await resolveUserIdById("engineer", requestedEngineerId);
      if (!engineer_id) {
        throw new AppError("Selected engineer not found", 400, "ENGINEER_NOT_FOUND");
      }
    }

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        const columns = [
            "customer_name",
            "equipment_name",
            "equipment_model",
            "equipment_brand_description",
            "equipment_part_no",
            "equipment_serial_no",
            "equipment_year",
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
            "parts",
            "labor",
            "job_data",
            "status",
            "engineer_id",
            "manager_id"
        ];

        const insertValues = [
            customer_name,
            equipment_name,
            equipment_model,
            equipment_brand_description,
            equipment_part_no,
            equipment_serial_no,
            equipment_year,
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
            JSON.stringify(safeParts),
            JSON.stringify(safeLabor),
            JSON.stringify(safeJobData),
            JOB_STATUSES.DRAFT,
            userId,
            manager_id
        ];
        

        const jsonbColumns = new Set(["parts", "labor", "job_data"]);

        const placeholders = columns
          .map((column, index) => {
            const placeholder = `$${index + 1}`;
            return jsonbColumns.has(column) ? `${placeholder}::jsonb` : placeholder;
          })
          .join(", ");

        // Insert required fields including engineer_id from authenticated user
        const result = await client.query(
            `INSERT INTO job_master (${columns.join(", ")})
             VALUES (${placeholders})
             RETURNING *`,
            insertValues
        );

        const createdJob = result.rows[0];
        const jobId = createdJob.id;

        if (safeParts.length > 0) {
          for (const part of safeParts) {
            await client.query(
              `INSERT INTO job_parts (job_id, part_name, quantity, unit_price, total)
               VALUES ($1, $2, $3, $4, $5)`,
              [jobId, part.part_name, part.quantity, part.unit_price, part.total]
            );
          }
        }

        if (safeLabor.length > 0) {
          for (const row of safeLabor) {
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
        req.logger.error({
          error: err.message,
          stack: err.stack,
          route: req.originalUrl
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
 *                         enum: [DRAFT, SUBMITTED, PENDING_APPROVAL, APPROVED, REJECTED, DELETED, COMPLETED]
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
                jm.equipment_model,
                jm.equipment_brand_description,
                jm.equipment_part_no,
                jm.equipment_serial_no,
                jm.equipment_year,
                jm.status,
                jm.created_at,
                jm.job_card_no,
                jm.job_date,
                jm.sales_area,
                jm.service_type,
                jm.engineer_id,
                jm.manager_id,
                eng.name AS engineer_name,
                eng.name AS engineerName,
                mgr.name AS manager_name,
                mgr.name AS managerName,
                ph.grand_total
             FROM job_master jm
             LEFT JOIN users eng ON jm.engineer_id = eng.id
             LEFT JOIN users mgr ON jm.manager_id = mgr.id
             LEFT JOIN pricing_header ph 
             ON jm.id = ph.job_id
        `;
    let values = [limit, offset];
    let whereClause = '';

    if (req.user.role === "engineer") {
      whereClause = ' WHERE jm.engineer_id = $3 AND jm.status != $4';
      values.push(req.user.id, JOB_STATUSES.DELETED);
    } else if (req.user.role === "manager") {
      whereClause = ' WHERE jm.manager_id = $3 AND jm.status != $4';
      values.push(req.user.id, JOB_STATUSES.DELETED);
    } else {
      whereClause = ' WHERE jm.status != $3';
      values.push(JOB_STATUSES.DELETED);
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
                equipment_model,
                equipment_brand_description,
                equipment_part_no,
                equipment_serial_no,
                equipment_year,
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
                job_data,
                engineer_id,
                manager_id
             FROM job_master
             WHERE id = $1`,
          [id]
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

      const [partsResult, laborResult] = await Promise.all([
          client.query("SELECT * FROM job_parts WHERE job_id = $1 ORDER BY id", [id]),
          client.query("SELECT * FROM job_labor WHERE job_id = $1 ORDER BY id", [id])
      ]);

      return sendSuccess(res, {
        job,
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
    console.error("[ROUTE HIT] ===== PUT /jobs/:id ROUTE EXECUTION STARTED ===== jobId=" + req.params.id);
    
    const jobId = Number(req.params.id);
    
    if (!Number.isInteger(jobId) || jobId <= 0) {
      throw new AppError("Invalid job id", 400, "INVALID_JOB_ID");
    }

    let jobResult;
    try {
      jobResult = await pool.query(
        "SELECT id, status, engineer_id, manager_id FROM job_master WHERE id = $1",
        [jobId]
      );
    } catch (err) {
      console.error("[FAILED QUERY] SELECT job_master failed:");
      console.error(err.message);
      console.error(err.stack);
      throw err;
    }

    if (jobResult.rows.length === 0) {
      throw new AppError("Job not found", 404, "JOB_NOT_FOUND");
    }

    const job = jobResult.rows[0];
    const currentStatus = normalizeStatus(job.status);

    if ([JOB_STATUSES.APPROVED, JOB_STATUSES.COMPLETED, JOB_STATUSES.DELETED].includes(currentStatus)) {
      throw new AppError("Finalized jobs cannot be modified", 400, "JOB_FINALIZED");
    }

    // Enforce strict ownership / assignment checks before update
    if (req.user.role === "engineer" && job.engineer_id !== req.user.id) {
      throw new AppError("Engineers can only update their own jobs", 403, "FORBIDDEN");
    }
    if (req.user.role === "manager" && job.manager_id !== req.user.id) {
      if (job.manager_id !== null && job.manager_id !== undefined && job.manager_id !== req.user.id) {
        throw new AppError("Insufficient permissions", 403, "FORBIDDEN");
      }
    }

    const updates = [];
    const values = [];
    let index = 1;

    const managerIdPayload = req.body?.manager_id ?? req.body?.job_data?.manager_id;
    const managerNamePayload = req.body?.manager_name ?? req.body?.job_data?.manager_name;
    if (managerIdPayload !== undefined || managerNamePayload !== undefined) {
      if (managerIdPayload === null) {
        updates.push(`manager_id = $${index}`);
        values.push(null);
        index += 1;
      } else if (managerIdPayload !== undefined) {
        const requestedManagerId = Number(managerIdPayload);
        if (!Number.isInteger(requestedManagerId) || requestedManagerId <= 0) {
          throw new AppError("manager_id must be a positive integer", 400, "INVALID_MANAGER_ID");
        }
        const resolvedManagerId = await resolveUserIdById("manager", requestedManagerId);
        if (!resolvedManagerId) {
          throw new AppError("Selected manager not found", 400, "MANAGER_NOT_FOUND");
        }
        updates.push(`manager_id = $${index}`);
        values.push(resolvedManagerId);
        index += 1;
      } else {
        const resolvedManagerId = await resolveManagerIdByName(managerNamePayload);
        if (managerNamePayload && !resolvedManagerId) {
          throw new AppError("Selected manager not found", 400, "MANAGER_NOT_FOUND");
        }
        updates.push(`manager_id = $${index}`);
        values.push(resolvedManagerId);
        index += 1;
      }
    }

    const engineerIdPayload = req.body?.engineer_id ?? req.body?.job_data?.engineer_id;
    if (engineerIdPayload !== undefined) {
      if (engineerIdPayload === null) {
        updates.push(`engineer_id = $${index}`);
        values.push(null);
        index += 1;
      } else {
        const requestedEngineerId = Number(engineerIdPayload);
        if (!Number.isInteger(requestedEngineerId) || requestedEngineerId <= 0) {
          throw new AppError("engineer_id must be a positive integer", 400, "INVALID_ENGINEER_ID");
        }
        if (req.user.role === "engineer" && requestedEngineerId !== req.user.id) {
          throw new AppError("Engineers can only assign jobs to themselves", 403, "FORBIDDEN");
        }
        const resolvedEngineerId = await resolveUserIdById("engineer", requestedEngineerId);
        if (!resolvedEngineerId) {
          throw new AppError("Selected engineer not found", 400, "ENGINEER_NOT_FOUND");
        }
        updates.push(`engineer_id = $${index}`);
        values.push(resolvedEngineerId);
        index += 1;
      }
    }

    const allowedUpdateFields = [
      "customer_name",
      "equipment_name",
      "equipment_model",
      "equipment_brand_description",
      "equipment_part_no",
      "equipment_serial_no",
      "equipment_year",
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
        const fieldValue = field === "job_data" ? req.body[field] : req.body[field];
        values.push(fieldValue);
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
      try {
        await client.query("BEGIN");
      } catch (err) {
        console.error("[FAILED QUERY] BEGIN transaction failed:");
        console.error(err.message);
        console.error(err.stack);
        throw err;
      }

      const updateQuery = `UPDATE job_master SET ${updates.join(", ")} WHERE id = $${values.length} RETURNING *`;
      
      let updatedResult;
      try {
        updatedResult = await client.query(updateQuery, values);
      } catch (err) {
        console.error("[FAILED QUERY] UPDATE job_master failed:");
        console.error(err.message);
        console.error(err.code);
        console.error(err.detail);
        console.error(err.stack);
        throw err;
      }
      
      const updatedJob = updatedResult.rows[0];

      if (Array.isArray(req.body.parts)) {
        
        try {
          await client.query("DELETE FROM job_parts WHERE job_id = $1", [jobId]);
        } catch (err) {
          console.error("[FAILED QUERY] DELETE job_parts failed:");
          console.error(err.message);
          console.error(err.stack);
          throw err;
        }

        for (let partIdx = 0; partIdx < req.body.parts.length; partIdx++) {
          const part = req.body.parts[partIdx];
          
          const mappedPart = mapPart(part);
          
          try {
            await client.query(
              `INSERT INTO job_parts (job_id, part_name, quantity, unit_price, total)
               VALUES ($1, $2, $3, $4, $5)`,
              [jobId, mappedPart.part_name, mappedPart.quantity, mappedPart.unit_price, mappedPart.total]
            );
          } catch (err) {
            console.error(`[FAILED QUERY] INSERT job_parts failed at index ${partIdx}:`);
            console.error(err.message);
            console.error(err.code);
            console.error(err.detail);
            console.error("Insert params:", [jobId, mappedPart.part_name, mappedPart.quantity, mappedPart.unit_price, mappedPart.total]);
            console.error(err.stack);
            throw err;
          }
        }
      } else {
      }

      if (Array.isArray(req.body.labor)) {
        
        try {
          await client.query("DELETE FROM job_labor WHERE job_id = $1", [jobId]);
        } catch (err) {
          console.error("[FAILED QUERY] DELETE job_labor failed:");
          console.error(err.message);
          console.error(err.stack);
          throw err;
        }

        for (let laborIdx = 0; laborIdx < req.body.labor.length; laborIdx++) {
          const laborRow = req.body.labor[laborIdx];
          
          const mappedLabor = mapLabor(laborRow);
          
          try {
            await client.query(
              `INSERT INTO job_labor (job_id, description, hours, rate, total)
               VALUES ($1, $2, $3, $4, $5)`,
              [jobId, mappedLabor.description, mappedLabor.hours, mappedLabor.rate, mappedLabor.total]
            );
          } catch (err) {
            console.error(`[FAILED QUERY] INSERT job_labor failed at index ${laborIdx}:`);
            console.error(err.message);
            console.error(err.code);
            console.error(err.detail);
            console.error("Insert params:", [jobId, mappedLabor.description, mappedLabor.hours, mappedLabor.rate, mappedLabor.total]);
            console.error(err.stack);
            throw err;
          }
        }
      } else {
      }

      try {
        await client.query("COMMIT");
      } catch (err) {
        console.error("[FAILED QUERY] COMMIT failed:");
        console.error(err.message);
        console.error(err.stack);
        throw err;
      }

      try {
        logAuditEvent(req, "Job Update", "job", jobId, job, updatedJob);
      } catch (err) {
        console.error("[FAILED] logAuditEvent failed:");
        console.error(err.message);
        console.error(err.stack);
        // Don't throw - audit is non-critical
      }

      return sendSuccess(res, updatedJob, "Job updated successfully");
    } catch (err) {
      
      console.error("PUT /jobs/:id FULL ERROR:");
      console.error(err);
      console.error(err.message);
      console.error(err.stack);

      try {
        await client.query("ROLLBACK");
      } catch (rollbackErr) {
        console.error("[UPDATE JOB] ROLLBACK FAILED:");
        console.error(rollbackErr.message);
      }

      req.logger.error({
        error: err.message,
        stack: err.stack,
        route: req.originalUrl,
        errorCode: err.code,
        errorDetail: err.detail
      });
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
      "SELECT id, status, engineer_id, manager_id, parts, labor FROM job_master WHERE id = $1",
      [jobId]
    );
    if (jobCheck.rows.length === 0) {
      throw new AppError("Job not found", 404, "JOB_NOT_FOUND");
    }
    const job = jobCheck.rows[0];
    const currentStatus = normalizeStatus(job.status);
    if ([JOB_STATUSES.APPROVED, JOB_STATUSES.COMPLETED, JOB_STATUSES.DELETED].includes(currentStatus)) {
      throw new AppError("Cannot update pricing for a finalized or deleted job", 400, "JOB_FINALIZED");
    }

    // Enforce strict ownership / assignment checks before updating pricing
    if (req.user.role === "engineer" && job.engineer_id !== req.user.id) {
      throw new AppError("Insufficient permissions", 403, "FORBIDDEN");
    }
    if (req.user.role === "manager" && job.manager_id !== req.user.id) {
      if (job.manager_id !== null && job.manager_id !== undefined && job.manager_id !== req.user.id) {
        throw new AppError("Insufficient permissions", 403, "FORBIDDEN");
      }
    }

    const body = req.body ?? {};
    const requiredPricingFields = [
      "labour_rate",
      "service_charge",
      "discount",
      "vat_percent",
      "parts_total",
      "labour_total",
      "taxable_amount",
    ];

    const missingFields = requiredPricingFields.filter(
      (field) => body[field] === undefined || body[field] === null
    );
    if (missingFields.length > 0) {
      throw new AppError(
        `Missing pricing payload fields: ${missingFields.join(", ")}`,
        400,
        "PRICING_PAYLOAD_INCOMPLETE",
        missingFields.map((field) => ({ field, message: "Required pricing field is missing" }))
      );
    }

    const labour_rate = toNum(body.labour_rate);
    const service_charge = toNum(body.service_charge);
    const discount = toNum(body.discount);
    const vat_percent = toNum(body.vat_percent, 5);

    if (labour_rate < 0 || service_charge < 0 || discount < 0 || vat_percent < 0) {
      throw new AppError("Pricing values cannot be negative", 400, "INVALID_PRICING_VALUE");
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const oldPricingResult = await client.query(
        "SELECT * FROM pricing_header WHERE job_id = $1 ORDER BY created_at DESC LIMIT 1",
        [jobId]
      );
      const oldPricing = oldPricingResult.rows[0] ?? null;

      const partsResult = await client.query(
        "SELECT quantity, unit_price, total FROM job_parts WHERE job_id = $1",
        [jobId]
      );
      const labourResult = await client.query(
        "SELECT hours, rate, total FROM job_labor WHERE job_id = $1",
        [jobId]
      );

      const parts = partsResult.rows.length > 0 ? partsResult.rows : Array.isArray(job.parts) ? job.parts : [];
      const labour = labourResult.rows.length > 0 ? labourResult.rows : Array.isArray(job.labor) ? job.labor : [];

      const computedPricing = pricingService.calculatePricingTotals({
        parts,
        labour,
        serviceCharge: service_charge,
        discountAmount: discount,
        vatPercent: vat_percent,
      });
      // Round totals to 2 decimals before storing to avoid FP mismatches
      const round2 = (v) => Math.round(Number(v || 0) * 100) / 100;


      await client.query("DELETE FROM pricing_header WHERE job_id = $1", [jobId]);

      const storedPricing = {
        parts_total: round2(computedPricing.parts_total),
        labour_total: round2(computedPricing.labour_total),
        taxable_amount: round2(computedPricing.taxable_amount),
        vat_amount: round2(computedPricing.vat_amount),
        grand_total: round2(computedPricing.grand_total),
      };


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
          storedPricing.parts_total,
          storedPricing.labour_total,
          storedPricing.taxable_amount,
          storedPricing.vat_amount,
          storedPricing.grand_total,
        ]
      );


      const currentJobStatus = normalizeStatus(job.status);
      if ([JOB_STATUSES.DRAFT, JOB_STATUSES.SUBMITTED].includes(currentJobStatus)) {
        await client.query(
          "UPDATE job_master SET status = $1, updated_at = CURRENT_TIMESTAMP, updated_by = $2 WHERE id = $3",
          [JOB_STATUSES.PENDING_APPROVAL, req.user.id, jobId]
        );
      }

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
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        const reqLogger = req.logger || logger;
        reqLogger.warn(
          {
            route: "/jobs/:id/pricing",
            jobId,
            rollbackError: rollbackError?.message,
            originalError: err?.message,
          },
          "Pricing route rollback failed"
        );
      }

      const reqLogger = req.logger || logger;
      reqLogger.error(
        {
          route: "/jobs/:id/pricing",
          jobId,
          pricingPayload: req.body,
          error: err?.message,
          stack: err?.stack,
        },
        "Pricing route failure"
      );

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
 *                 enum: [DRAFT, SUBMITTED, PENDING_APPROVAL, APPROVED, REJECTED, DELETED, COMPLETED]
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
// APPROVED and COMPLETED jobs are immutable.
// Approval requires a pricing row with grand_total > 0.
app.put(
  "/jobs/:id/status",
  requireAuth,
  requireRole("engineer", "manager", "admin"),
  validate({ params: idParamSchema, body: statusUpdateSchema }),
  asyncHandler(async (req, res) => {
    const jobId = Number(req.params.id);
    if (!Number.isInteger(jobId) || jobId <= 0) {
      throw new AppError("Invalid job id", 400, "INVALID_JOB_ID");
    }


    const requestedStatus = normalizeStatus(req.body?.status);
    if (!requestedStatus) {
      throw new AppError("status is required", 400, "STATUS_REQUIRED");
    }

    req.logger.info("Attempting job status update", {
      eventType: "job_status_update",
      jobId,
      requestedStatus,
      userRole: req.user.role,
    });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const jobResult = await client.query(
        `SELECT id, status, engineer_id, manager_id, customer_name, job_card_no, job_date,
                ref_no, sales_area, service_type, under_warranty
         FROM job_master
         WHERE id = $1`,
        [jobId]
      );
      if (jobResult.rows.length === 0) {
        throw new AppError("Job not found", 404, "JOB_NOT_FOUND");
      }

      const job = jobResult.rows[0];
      const currentStatus = normalizeStatus(job.status);

      if (currentStatus === JOB_STATUSES.DELETED) {
        throw new AppError("Deleted jobs cannot be modified", 400, "JOB_DELETED");
      }

      if (requestedStatus === JOB_STATUSES.DELETED) {
        throw new AppError(
          "Use DELETE /jobs/:id to soft delete jobs",
          400,
          "INVALID_STATUS_TRANSITION"
        );
      }

      if (!canTransition(currentStatus, requestedStatus, req.user.role)) {
        throw new AppError(
          `Cannot transition status from ${currentStatus} to ${requestedStatus}`,
          400,
          "INVALID_STATUS_TRANSITION"
        );
      }

      if (requestedStatus === JOB_STATUSES.APPROVED) {
        const approvalValidation = await validateJobReadyForApproval({ jobId, client, approverId: req.user.id });
        if (!approvalValidation.success) {
          throw new AppError(
            approvalValidation.error.message,
            400,
            approvalValidation.error.code,
            approvalValidation.error.details
          );
        }
      }

      let pricingResult = null;
      if (requestedStatus === JOB_STATUSES.APPROVED) {
        pricingResult = await client.query(
          "SELECT * FROM pricing_header WHERE job_id = $1 ORDER BY created_at DESC LIMIT 1",
          [jobId]
        );
        if (pricingResult.rows.length === 0) {
          throw new AppError("Cannot approve job without pricing", 400, "MISSING_PRICING");
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
          job: { ...job, status: requestedStatus },
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
      const values = [requestedStatus, req.user.id];
      if (requestedStatus === JOB_STATUSES.APPROVED) {
        fields.push("approved_by_id = $3", "approved_at = CURRENT_TIMESTAMP");
        values.push(req.user.id);
      }
      values.push(jobId);
      const whereParam = values.length;

      const updateQuery = `UPDATE job_master SET ${fields.join(", ")} WHERE id = $${whereParam} RETURNING *`;
      const updated = await client.query(updateQuery, values);

      await client.query("COMMIT");

      const actionType = requestedStatus === JOB_STATUSES.APPROVED
        ? "Job Approval"
        : requestedStatus === JOB_STATUSES.COMPLETED
          ? "Job Closure"
          : requestedStatus === JOB_STATUSES.DELETED
            ? "Job Deletion"
            : "Status Change";

      logAuditEvent(req, actionType, "job", jobId, { status: currentStatus }, { status: requestedStatus });

      let eventType;
      if (requestedStatus === JOB_STATUSES.APPROVED) {
        eventType = eventService.EVENT_TYPES.JOB_APPROVED;
      } else if (requestedStatus === JOB_STATUSES.COMPLETED) {
        eventType = eventService.EVENT_TYPES.JOB_CLOSED;
      }

      if (eventType) {
        const event = await eventService.emitEvent({
          eventType,
          entityType: "job",
          entityId: jobId,
          payload: {
            previous_status: currentStatus,
            new_status: requestedStatus,
            customer_name: job.customer_name,
            job_card_no: job.job_card_no,
            sales_area: job.sales_area,
            service_type: job.service_type,
            engineer_id: job.engineer_id,
            approved_by_id: req.user.id,
            approved_by: req.user.id,
          },
          createdBy: req.user.id,
          client,
        });

        if (event) {
          const notificationType = requestedStatus === JOB_STATUSES.APPROVED
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

      if (requestedStatus === JOB_STATUSES.APPROVED) {
        const approvalJob = { ...job, status: requestedStatus };
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

app.delete(
  "/jobs/:id",
  requireAuth,
  requireRole("manager", "admin"),
  validate({ params: idParamSchema, body: deleteJobSchema }),
  asyncHandler(async (req, res) => {
    const jobId = Number(req.params.id);
    if (!Number.isInteger(jobId) || jobId <= 0) {
      throw new AppError("Invalid job id", 400, "INVALID_JOB_ID");
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const jobResult = await client.query(
        "SELECT id, status, engineer_id, manager_id FROM job_master WHERE id = $1",
        [jobId]
      );
      if (jobResult.rows.length === 0) {
        throw new AppError("Job not found", 404, "JOB_NOT_FOUND");
      }

      const job = jobResult.rows[0];
      const currentStatus = normalizeStatus(job.status);
      if (currentStatus === JOB_STATUSES.DELETED) {
        throw new AppError("Job is already deleted", 400, "JOB_ALREADY_DELETED");
      }

      if (req.user.role === "manager" && job.manager_id !== req.user.id) {
        if (job.manager_id !== null && job.manager_id !== undefined && job.manager_id !== req.user.id) {
          throw new AppError("Insufficient permissions", 403, "FORBIDDEN");
        }
      }

      await client.query(
        `UPDATE job_master
         SET status = $1,
             deleted_at = CURRENT_TIMESTAMP,
             deleted_by = $2,
             delete_reason = $3,
             updated_at = CURRENT_TIMESTAMP,
             updated_by = $2
         WHERE id = $4`,
        [JOB_STATUSES.DELETED, req.user.id, req.body.delete_reason, jobId]
      );

      await client.query("COMMIT");

      logAuditEvent(req, "Job Deletion", "job", jobId, { status: job.status }, { status: JOB_STATUSES.DELETED, delete_reason: req.body.delete_reason });

      return sendSuccess(res, { id: jobId, status: JOB_STATUSES.DELETED });
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
    if (!updated) {
      console.error('[POST /signatures/manager] DB update failed for user:', req.user.id);
      throw new AppError('Failed to persist manager signature metadata', 500);
    }

    if (process.env.NODE_ENV === "development") {
      req.logger.info("Manager signature uploaded", {
        eventType: "upload",
        filepath: uploadResult.filepath,
      });
    }

    logAuditEvent(req, "Signature Upload", "user", req.user.id, {
      signature_url: existing?.signature_url ?? null,
    }, {
      signature_url: updated?.signature_url ?? null,
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
    if (!updated) {
      console.error('[POST /signatures/engineer] DB update failed for user:', req.user.id);
      throw new AppError('Failed to persist engineer signature metadata', 500);
    }

    if (process.env.NODE_ENV === "development") {
      req.logger.info("Engineer signature uploaded", {
        eventType: "upload",
        filepath: uploadResult.filepath,
      });
    }

    logAuditEvent(req, "Signature Upload", "user", req.user.id, {
      signature_url: existing?.signature_url ?? null,
    }, {
      signature_url: updated?.signature_url ?? null,
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

    // Enforce strict ownership / assignment checks before getting approved documents
    const jobResult = await pool.query(
      "SELECT id, engineer_id, manager_id FROM job_master WHERE id = $1",
      [jobId]
    );
    if (jobResult.rows.length === 0) {
      throw new AppError("Job not found", 404, "JOB_NOT_FOUND");
    }
    const job = jobResult.rows[0];

    if (req.user.role === "engineer" && job.engineer_id !== req.user.id) {
      throw new AppError("Insufficient permissions", 403, "FORBIDDEN");
    }
    if (req.user.role === "manager" && job.manager_id !== req.user.id) {
      if (job.manager_id !== null && job.manager_id !== undefined && job.manager_id !== req.user.id) {
        throw new AppError("Insufficient permissions", 403, "FORBIDDEN");
      }
    }

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
      "SELECT id, status, approved_by_id, approved_by, manager_id FROM job_master WHERE id = $1",
      [jobId]
    );
    if (jobResult.rows.length === 0) {
      throw new AppError("Job not found", 404);
    }

    const job = jobResult.rows[0];

    // Enforce strict ownership / assignment checks before uploading approved documents
    if (req.user.role === "manager" && job.manager_id !== req.user.id) {
      if (job.manager_id !== null && job.manager_id !== undefined && job.manager_id !== req.user.id) {
        throw new AppError("Insufficient permissions", 403, "FORBIDDEN");
      }
    }

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
