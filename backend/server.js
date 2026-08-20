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
import { globalLimiter, authLimiter, adminActionLimiter, uploadLimiter } from "./middleware/rateLimiters.js";
import { signatureUpload, documentUpload, reportUpload, saveUploadedFile, deleteUploadedFile } from "./middleware/upload.js";
import { generateSecureFilename } from "./utils/uploadHelpers.js";
import { deriveClosureFields, CLOSURE_COLUMNS } from "./utils/jobClosureFields.js";
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
  adminCreateUserSchema,
  adminUpdateUserSchema,
  adminSetPasswordSchema,
  profileUpdateSchema,
  signatureUploadSchema,
  pdfGenerationSchema,
  aiDescriptionSchema,
  idParamSchema,
} from "./validators/schemas.js";
import { collectJobCardIssues, throwIfIncomplete } from "./validators/jobCardValidation.js";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// ─── Global error handlers (prevent crash loop) ───────────────────────────────
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err.message);
  console.error(err.stack);
  // Do NOT exit — let Azure keep the process alive
});

process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED REJECTION:", reason instanceof Error ? reason.message : reason);
  if (reason instanceof Error) console.error(reason.stack);
  // Do NOT exit — let Azure keep the process alive
});

const app = express();
app.set("trust proxy", 1);

// ─── Middleware ───────────────────────────────────────────────────────────────
app.disable("x-powered-by");
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: [
          "'self'",
          "https://job-card-agent.azurewebsites.net",
          "http://localhost:8080",
          "http://localhost:5173",
        ],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        fontSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    crossOriginResourcePolicy: {
      policy: "cross-origin",
    },
  })
);
const configuredFrontendOrigins = (process.env.ALLOWED_ORIGINS || process.env.FRONTEND_URL || "http://localhost:5173,http://127.0.0.1:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
// Convenience for local work only. In production the allowlist above is the whole
// policy — otherwise any page served from a developer machine or the office LAN
// would be a permitted origin against live data.
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const isAllowedDevelopmentOrigin = (origin) =>
  !IS_PRODUCTION && /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+):\d+$/.test(origin);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }

    const allowedOrigins = new Set(configuredFrontendOrigins);
    if (allowedOrigins.has(origin) || isAllowedDevelopmentOrigin(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`CORS origin not allowed: ${origin}`));
  },
  credentials: true,
}));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

// Request correlation and logging (must be early in middleware chain)
app.use(requestCorrelation);
app.use(requestLogger);
app.use(globalLimiter);
app.use(["/api/admin/users", "/api/admin/users/:id/password", "/api/admin/users/:id/toggle-active"], adminActionLimiter);

// FIX 1: Use __dirname-relative path for uploads so Azure resolves it correctly
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.post("/api/uploads", requireAuth, uploadLimiter, (req, res, next) => {
  reportUpload(req, res, async (uploadError) => {
    if (uploadError) return next(new AppError(uploadError.message, 400, "UPLOAD_ERROR"));
    try {
      const kind = String(req.body?.kind || "photo").toLowerCase();
      const files = Array.isArray(req.files) ? req.files : [];
      if (!files.length) return next(new AppError("At least one file is required", 400, "UPLOAD_EMPTY"));
      if (kind === "sound" && files.length !== 1) return next(new AppError("Only one sound file may be uploaded", 400, "UPLOAD_INVALID_COUNT"));
      if (!["photo", "sound"].includes(kind)) return next(new AppError("Upload kind must be photo or sound", 400, "UPLOAD_INVALID_KIND"));
      for (const file of files) {
        const isPhoto = file.mimetype.startsWith("image/");
        const isSound = file.mimetype.startsWith("audio/");
        if ((kind === "photo" && !isPhoto) || (kind === "sound" && !isSound)) return next(new AppError(`Invalid ${kind} file type`, 400, "UPLOAD_INVALID_TYPE"));
        if (kind === "photo" && file.size > 10 * 1024 * 1024) return next(new AppError("Photo files must be 10MB or smaller", 400, "UPLOAD_TOO_LARGE"));
      }
      const saved = await Promise.all(files.map((file) => saveUploadedFile(file, req.user.id, "report", kind)));
      const failed = saved.find((file) => file.error);
      if (failed) return next(new AppError(failed.error, 500, "UPLOAD_SAVE_FAILED"));
      // Return the storage provider's own URL: a path for local storage, an absolute
      // blob URL for Azure. Host-qualifying it here would bake the current hostname
      // into every stored reference and break them on a domain change or slot swap.
      const first = saved[0];
      return res.status(201).json({ success: true, fileUrl: first.url, fileName: first.filename, files: saved.map((file) => ({ fileUrl: file.url, fileName: file.filename })) });
    } catch (error) {
      return next(error);
    }
  });
});

// ─── Swagger UI ──────────────────────────────────────────────────────────────
// Swagger UI is a browser page, so it can't carry a Bearer token — instead of
// publishing the whole API surface to anyone who finds the path, it is off in
// production unless ENABLE_API_DOCS is explicitly set.
if (!IS_PRODUCTION || process.env.ENABLE_API_DOCS === "true") {
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(specs));
} else {
  logger.info("API docs disabled in production", { eventType: "startup" });
}

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
        part_number: p.partNumber ?? p.part_number ?? null,
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
app.get("/health-basic", (_req, res) => res.send("Backend is running"));

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
// Development helper only. /ready covers the same ground for monitoring without
// confirming database reachability to unauthenticated callers in production.
if (!IS_PRODUCTION) {
  app.get(
    "/test-db",
    asyncHandler(async (_req, res) => {
      const result = await pool.query("SELECT NOW()");
      return sendSuccess(res, { time: result.rows[0] });
    })
  );
}

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

// Search customer master data. Deployments that have a dedicated customers table
// use it; older installations safely fall back to active users.
app.get(["/customers/search", "/api/customers/search"], requireAuth, asyncHandler(async (req, res) => {
  const query = String(req.query.q || "").trim();
  if (query.length < 2) return res.json([]);
  try {
    const result = await pool.query(
      `SELECT id, name, code, email, contact FROM customers
       WHERE active IS NOT FALSE AND (name ILIKE $1 OR code ILIKE $1)
       ORDER BY name LIMIT 25`, [`%${query}%`]
    );
    return res.json(result.rows);
  } catch (error) {
    if (error.code !== "42P01") throw error;
    const result = await pool.query(
      `SELECT id, name, NULL::text AS code, email, NULL::text AS contact FROM users
       WHERE is_active IS NOT FALSE AND name ILIKE $1 ORDER BY name LIMIT 25`, [`%${query}%`]
    );
    return res.json(result.rows);
  }
}));

app.get(["/brands", "/api/brands"], requireAuth, asyncHandler(async (_req, res) => {
  const result = await pool.query("SELECT id, name FROM brands WHERE active = TRUE ORDER BY name");
  return res.json(result.rows);
}));

// ─── PUT /users/:id ───────────────────────────────────────────────────────────
// Self-service profile update behind the Profile Settings screen. Admins may edit
// anyone; everybody else may only edit their own record. Role, email and active
// status are deliberately not editable here — those belong to /api/admin/users.
app.put(
  "/users/:id",
  requireAuth,
  validate({ params: idParamSchema, body: profileUpdateSchema }),
  asyncHandler(async (req, res) => {
    const userId = Number(req.params.id);

    if (req.user.role !== "admin" && req.user.id !== userId) {
      logAuditEvent(req, "Blocked Profile Update", "user", userId, null, {
        reason: "Attempted to update another user's profile",
        actorId: req.user.id,
      });
      throw new AppError("You can only update your own profile", 403, "FORBIDDEN");
    }

    const existing = await pool.query(
      "SELECT id, name, phone, department FROM users WHERE id = $1",
      [userId]
    );
    if (existing.rows.length === 0) {
      throw new AppError("User not found", 404, "USER_NOT_FOUND");
    }

    const { fullName, phone, department } = req.body ?? {};
    const updates = [];
    const values = [];
    const changed = [];
    let index = 1;

    if (fullName !== undefined) {
      updates.push(`name = $${index++}`);
      values.push(fullName);
      changed.push("name");
    }
    if (phone !== undefined) {
      updates.push(`phone = $${index++}`);
      values.push(phone);
      changed.push("phone");
    }
    if (department !== undefined) {
      updates.push(`department = $${index++}`);
      values.push(department);
      changed.push("department");
    }
    if (updates.length === 0) {
      throw new AppError("No profile fields to update", 400, "NO_UPDATE_FIELDS");
    }

    updates.push("updated_at = CURRENT_TIMESTAMP");
    values.push(userId);

    const result = await pool.query(
      `UPDATE users SET ${updates.join(", ")} WHERE id = $${index}
       RETURNING id, name, name AS "fullName", email, role, phone, department`,
      values
    );

    logAuditEvent(req, "Profile Updated", "user", userId, existing.rows[0], {
      fields: changed,
      ...result.rows[0],
    });

    return sendSuccess(res, result.rows[0], "Profile updated successfully");
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
    const initialStatus = req.user?.role === "engineer" ? JOB_STATUSES.PENDING_APPROVAL : JOB_STATUSES.DRAFT;
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
    const isEngineerRequest = req.user?.role === "engineer";
    const partsJson = partsInput.map((part) => {
      const mapped = mapPart(part);
      return isEngineerRequest
        ? { ...mapped, unit_price: 0, total: 0 }
        : mapped;
    });
    const laborJson = laborInput.map((entry) => {
      const mapped = mapLabor(entry);
      return isEngineerRequest
        ? { ...mapped, rate: 0, total: 0 }
        : mapped;
    });
    function sanitizeJson(value) {
      return JSON.parse(JSON.stringify(value));
    }

    const safeParts = sanitizeJson(partsJson);
    const safeLabor = sanitizeJson(laborJson);
    const safeJobData = {
      ...sanitizeJson(typeof req.body?.job_data === "object" && req.body.job_data ? req.body.job_data : {}),
      parts: safeParts,
      labor: safeLabor,
      compressor_checklist: sanitizeJson(req.body?.job_data?.compressor_checklist ?? req.body?.compressor_checklist ?? []),
      dryer_checklist: sanitizeJson(req.body?.job_data?.dryer_checklist ?? req.body?.dryer_checklist ?? []),
    };

    if (isEngineerRequest) {
      safeJobData.service_charge = 0;
    }

    // ─── MANDATORY FIELDS ─────────────────────────────────────────────────────
    // One pass, every problem reported together so the form can mark each field.
    throwIfIncomplete(
      collectJobCardIssues({
        fields: {
          customer_name,
          ref_no,
          job_card_no,
          job_date,
          service_type,
          customer_code,
          attention_of,
          contact_no,
          sales_area,
          equipment_model,
          equipment_brand_description,
          equipment_part_no,
          equipment_serial_no,
          equipment_year,
        },
        jobData: safeJobData,
        parts: safeParts,
        labor: safeLabor,
      })
    );

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
    
    // Manager Name is mandatory
    if (!manager_id) {
      throwIfIncomplete([
        { field: "manager_id", message: "A manager must be assigned to the job." },
      ]);
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
            isEngineerRequest ? 0 : other_expenses,
            isEngineerRequest ? 0 : discount_percentage,
            JSON.stringify(safeParts),
            JSON.stringify(safeLabor),
            JSON.stringify(safeJobData),
            initialStatus,
            userId,
            manager_id
        ];

        // Same derivation as the update path. Without it a job created with the
        // closure section already filled in would have to be saved a second time
        // before approval validation could see any of those answers.
        const createClosureFields = deriveClosureFields(req.body?.evidence);
        for (const column of CLOSURE_COLUMNS) {
            columns.push(column);
            insertValues.push(createClosureFields[column]);
        }


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

        await client.query(
          `UPDATE job_master SET
             customer_location = $1, site_contact = $2, time_in = $3, time_out = $4,
             report_date = $5, customer_po_ref = $6, complaint_issue_description = $7,
             customer_equipment_id = $8, equipment_type = $9, meter_reading = $10,
             capacity_rating = $11, controller_panel_model = $12, alarm_fault_code = $13,
             last_service_date = $14, last_service_hours = $15, oil_refrigerant_fuel_type = $16,
             duty_cycle = $17, warranty_status = $18, warranty_claim_ref = $19, previous_job_ref = $20,
             customer_issues = $21::jsonb, operating_data = $22::jsonb, findings = $23::jsonb, evidence = $24::jsonb
           WHERE id = $25`,
          [req.body.customer_location ?? null, req.body.site_contact ?? null, req.body.time_in ?? null, req.body.time_out ?? null,
            req.body.report_date ?? null, req.body.customer_po_ref ?? null, req.body.complaint_issue_description ?? null,
            req.body.customer_equipment_id ?? null, req.body.equipment_type ?? null, req.body.meter_reading ?? null,
            req.body.capacity_rating ?? null, req.body.controller_panel_model ?? null, req.body.alarm_fault_code ?? null,
            req.body.last_service_date ?? null, req.body.last_service_hours ?? null, req.body.oil_refrigerant_fuel_type ?? null,
            req.body.duty_cycle ?? null, req.body.warranty_status ?? null, req.body.warranty_claim_ref ?? null, req.body.previous_job_ref ?? null,
            JSON.stringify(req.body.customer_issues ?? []), JSON.stringify(req.body.operating_data ?? {}), JSON.stringify(req.body.findings ?? {}), JSON.stringify(req.body.evidence ?? {}), jobId]
        );

        if (safeParts.length > 0) {
          for (const part of safeParts) {
            await client.query(
              `INSERT INTO job_parts (job_id, part_name, part_number, quantity, unit_price, total)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [jobId, part.part_name, part.part_number || null, part.quantity, part.unit_price, part.total]
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
        if (err instanceof AppError) {
          return sendError(res, err.statusCode || 400, err.message, err.errorCode || "VALIDATION_ERROR");
        }
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
                customer_location, site_contact, time_in, time_out, report_date, customer_po_ref, complaint_issue_description,
                customer_equipment_id, equipment_type, meter_reading, capacity_rating, controller_panel_model, alarm_fault_code,
                last_service_date, last_service_hours, oil_refrigerant_fuel_type, duty_cycle, warranty_status, warranty_claim_ref, previous_job_ref,
                customer_issues, operating_data, findings, evidence,
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
        throw new AppError("Insufficient permissions", 403, "FORBIDDEN");
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
      throw new AppError("Insufficient permissions", 403, "FORBIDDEN");
    }

    // ─── MANDATORY FIELDS ─────────────────────────────────────────────────────
    // Same single pass as the create route, so a rejected update names every field.
    throwIfIncomplete(
      collectJobCardIssues({
        fields: req.body,
        jobData: req.body.job_data,
        parts: req.body.parts,
        labor: req.body.labor,
      })
    );

    const updates = [];
    const values = [];
    let index = 1;

    if (req.user.role === "engineer") {
      req.body.other_expenses = 0;
      req.body.discount_percentage = 0;
      if (req.body.job_data && typeof req.body.job_data === "object") {
        req.body.job_data.service_charge = 0;
      }
    }

    const managerIdPayload = req.body?.manager_id ?? req.body?.job_data?.manager_id;
    const managerNamePayload = req.body?.manager_name ?? req.body?.job_data?.manager_name;
    if ((managerIdPayload === undefined || managerIdPayload === null) && !managerNamePayload) {
      throwIfIncomplete([
        { field: "manager_id", message: "A manager must be assigned to the job." },
      ]);
    }
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
      "customer_location", "site_contact", "time_in", "time_out", "report_date", "customer_po_ref", "complaint_issue_description",
      "customer_equipment_id", "equipment_type", "meter_reading", "capacity_rating", "controller_panel_model", "alarm_fault_code", "last_service_date", "last_service_hours", "oil_refrigerant_fuel_type", "duty_cycle", "warranty_status", "warranty_claim_ref", "previous_job_ref", "customer_issues", "operating_data", "findings", "evidence",
      "other_expenses",
      "discount_percentage",
      "job_data",
    ];

    for (const field of allowedUpdateFields) {
      if (field in req.body) {
        updates.push(`${field} = $${index}`);
        const fieldValue = ["job_data", "customer_issues", "operating_data", "findings", "evidence"].includes(field)
          ? JSON.stringify(req.body[field]) : req.body[field];
        values.push(fieldValue);
        index += 1;
      }
    }

    // The job closure answers arrive inside `evidence` and are stored there as
    // JSONB, but approval validation reads the dedicated columns migration 013
    // added. Nothing wrote those columns, so those checks were reading NULLs and
    // default falses no matter what the engineer filled in. Derive them here so
    // the stored JSON and the columns cannot disagree.
    if ("evidence" in req.body) {
      const closureFields = deriveClosureFields(req.body.evidence);
      for (const column of CLOSURE_COLUMNS) {
        updates.push(`${column} = $${index}`);
        values.push(closureFields[column]);
        index += 1;
      }
    }

    if (req.user.role === "engineer") {
      updates.push(`status = $${index}`);
      values.push(JOB_STATUSES.PENDING_APPROVAL);
      index += 1;
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

      if (req.user.role === "engineer") {
        const existingPartsResult = await client.query(
          "SELECT id, unit_price FROM job_parts WHERE job_id = $1",
          [jobId]
        );
        const existingLaborResult = await client.query(
          "SELECT id, rate FROM job_labor WHERE job_id = $1",
          [jobId]
        );

        const partPriceById = new Map(
          existingPartsResult.rows.map((row) => [String(row.id), toNum(row.unit_price)])
        );
        const laborRateById = new Map(
          existingLaborResult.rows.map((row) => [String(row.id), toNum(row.rate)])
        );

        if (Array.isArray(req.body.parts)) {
          for (const part of req.body.parts) {
            const partId = part?.id != null ? String(part.id) : null;
            const providedUnitPrice = toNum(part?.unitPrice ?? part?.unit_price);

            if (partId && partPriceById.has(partId)) {
              const preserved = partPriceById.get(partId) ?? 0;
              if (providedUnitPrice !== preserved) {
                part.unitPrice = preserved;
                part.unit_price = preserved;
              }
            } else {
              part.unitPrice = 0;
              part.unit_price = 0;
            }
          }
        }

        if (Array.isArray(req.body.labor)) {
          for (const laborRow of req.body.labor) {
            const laborId = laborRow?.id != null ? String(laborRow.id) : null;
            const providedRate = toNum(laborRow?.ratePerHour ?? laborRow?.rate);

            if (laborId && laborRateById.has(laborId)) {
              const preserved = laborRateById.get(laborId) ?? 0;
              if (providedRate !== preserved) {
                laborRow.ratePerHour = preserved;
                laborRow.rate = preserved;
              }
            } else {
              laborRow.ratePerHour = 0;
              laborRow.rate = 0;
            }
          }
        }
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
              `INSERT INTO job_parts (job_id, part_name, part_number, quantity, unit_price, total)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [jobId, mappedPart.part_name, mappedPart.part_number || null, mappedPart.quantity, mappedPart.unit_price, mappedPart.total]
            );
          } catch (err) {
            console.error(`[FAILED QUERY] INSERT job_parts failed at index ${partIdx}:`);
            console.error(err.message);
            console.error(err.code);
            console.error(err.detail);
            console.error("Insert params:", [jobId, mappedPart.part_name, mappedPart.part_number || null, mappedPart.quantity, mappedPart.unit_price, mappedPart.total]);
            console.error(err.stack);
            throw err;
          }
        }
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
  requireRole("manager", "admin"),
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
      throw new AppError("Insufficient permissions", 403, "FORBIDDEN");
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
  requireRole("manager", "admin"),
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

      if (req.user.role === "manager" && job.manager_id !== req.user.id) {
        throw new AppError("Insufficient permissions", 403, "FORBIDDEN");
      }

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
        throw new AppError("Insufficient permissions", 403, "FORBIDDEN");
      }

      // deleted_by and updated_by must not share a parameter. deleted_by is an
      // integer referencing users(id) while updated_by is text, so binding both to
      // $2 made Postgres fail to deduce a single type for it — every delete came
      // back "inconsistent types deduced for parameter $2" and no job was ever
      // deleted. Each column gets its own placeholder now.
      await client.query(
        `UPDATE job_master
         SET status = $1,
             deleted_at = CURRENT_TIMESTAMP,
             deleted_by = $2,
             delete_reason = $3,
             updated_at = CURRENT_TIMESTAMP,
             updated_by = $4
         WHERE id = $5`,
        [JOB_STATUSES.DELETED, req.user.id, req.body.delete_reason, String(req.user.id), jobId]
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
      "SELECT id, name, email, password_hash, role, signature_url, phone, department FROM users WHERE email = $1 AND is_active = true",
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
          // Profile Settings renders these, so they have to survive a fresh login.
          phone: user.phone ?? "",
          department: user.department ?? "",
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

    // A deactivated account must not be able to keep minting access tokens, even if
    // is_active was flipped directly in the database rather than through /api/admin.
    if (tokenRecord.user_is_active === false) {
      await tokenService.revokeRefreshTokenByHash(refreshTokenHash);
      logAuditEvent(req, "Blocked Refresh For Inactive User", "auth", tokenRecord.user_id, null, {
        reason: "Account is deactivated",
      });
      throw new AppError("Account is deactivated", 401, "ACCOUNT_DEACTIVATED");
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
          new_token_id: null,
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

// ─── Admin user management routes ─────────────────────────────────────────────
// All routes below are admin-only and rate limited via adminActionLimiter.

const revokeAllRefreshTokensForUser = (userId) =>
  pool.query(
    "UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL",
    [userId]
  );

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     summary: List all users
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of users
 */
app.get(
  "/api/admin/users",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (_req, res) => {
    const result = await pool.query(
      `SELECT id, name AS full_name, email, role, is_active
         FROM users
        ORDER BY name ASC`
    );
    return sendSuccess(res, result.rows);
  })
);

/**
 * @swagger
 * /api/admin/users:
 *   post:
 *     summary: Create a user
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: User created
 */
app.post(
  "/api/admin/users",
  requireAuth,
  requireRole("admin"),
  validate({ body: adminCreateUserSchema }),
  asyncHandler(async (req, res) => {
    const { name, email, password, role } = req.body ?? {};

    const existing = await pool.query("SELECT id FROM users WHERE LOWER(email) = LOWER($1)", [email]);
    if (existing.rows.length > 0) {
      throw new AppError("A user with that email already exists", 409, "USER_EMAIL_EXISTS");
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, is_active)
            VALUES ($1, $2, $3, $4, TRUE)
         RETURNING id, name AS full_name, email, role, is_active`,
      [name, email, hashedPassword, role]
    );

    logAuditEvent(req, "Admin User Created", "user", result.rows[0].id, null, {
      email: result.rows[0].email,
      role: result.rows[0].role,
    });

    return sendSuccess(res, result.rows[0], "User created successfully", 201);
  })
);

/**
 * @swagger
 * /api/admin/users/{id}:
 *   put:
 *     summary: Update a user's profile
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User updated
 */
app.put(
  "/api/admin/users/:id",
  requireAuth,
  requireRole("admin"),
  validate({ params: idParamSchema, body: adminUpdateUserSchema }),
  asyncHandler(async (req, res) => {
    const userId = Number(req.params.id);
    const { name, email, role } = req.body ?? {};

    const existingResult = await pool.query(
      "SELECT id, name, email, role FROM users WHERE id = $1",
      [userId]
    );
    if (existingResult.rows.length === 0) {
      throw new AppError("User not found", 404, "USER_NOT_FOUND");
    }
    const existing = existingResult.rows[0];

    // Prevent an admin from demoting themselves out of admin access.
    if (userId === req.user.id && role && role !== existing.role) {
      throw new AppError("You cannot change your own role", 400, "ADMIN_SELF_ROLE_CHANGE");
    }

    if (email && email.toLowerCase() !== existing.email.toLowerCase()) {
      const duplicate = await pool.query(
        "SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND id <> $2",
        [email, userId]
      );
      if (duplicate.rows.length > 0) {
        throw new AppError("A user with that email already exists", 409, "USER_EMAIL_EXISTS");
      }
    }

    const result = await pool.query(
      `UPDATE users
          SET name = COALESCE($1, name),
              email = COALESCE($2, email),
              role = COALESCE($3, role),
              updated_at = NOW()
        WHERE id = $4
    RETURNING id, name AS full_name, email, role, is_active`,
      [name ?? null, email ?? null, role ?? null, userId]
    );

    logAuditEvent(
      req,
      "Admin User Updated",
      "user",
      userId,
      { name: existing.name, email: existing.email, role: existing.role },
      { name: result.rows[0].full_name, email: result.rows[0].email, role: result.rows[0].role }
    );

    return sendSuccess(res, result.rows[0], "User updated successfully");
  })
);

/**
 * @swagger
 * /api/admin/users/{id}/password:
 *   put:
 *     summary: Set a user's password
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Password updated
 */
app.put(
  "/api/admin/users/:id/password",
  requireAuth,
  requireRole("admin"),
  validate({ params: idParamSchema, body: adminSetPasswordSchema }),
  asyncHandler(async (req, res) => {
    const userId = Number(req.params.id);
    const { newPassword } = req.body ?? {};

    const existing = await pool.query("SELECT id, email FROM users WHERE id = $1", [userId]);
    if (existing.rows.length === 0) {
      throw new AppError("User not found", 404, "USER_NOT_FOUND");
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query("UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2", [
      hashedPassword,
      userId,
    ]);

    // Force re-authentication everywhere the old password was used.
    await revokeAllRefreshTokensForUser(userId);

    logAuditEvent(req, "Admin Password Reset", "user", userId, null, {
      email: existing.rows[0].email,
    });

    return sendSuccess(res, { id: userId }, "Password updated successfully");
  })
);

/**
 * @swagger
 * /api/admin/users/{id}/toggle-active:
 *   put:
 *     summary: Enable or disable a user account
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Status updated
 */
app.put(
  "/api/admin/users/:id/toggle-active",
  requireAuth,
  requireRole("admin"),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const userId = Number(req.params.id);

    if (userId === req.user.id) {
      throw new AppError("You cannot change your own account status", 400, "ADMIN_SELF_DEACTIVATE");
    }

    const existing = await pool.query("SELECT id, email, is_active FROM users WHERE id = $1", [userId]);
    if (existing.rows.length === 0) {
      throw new AppError("User not found", 404, "USER_NOT_FOUND");
    }

    const result = await pool.query(
      `UPDATE users
          SET is_active = NOT COALESCE(is_active, TRUE),
              updated_at = NOW()
        WHERE id = $1
    RETURNING id, name AS full_name, email, role, is_active`,
      [userId]
    );
    const updated = result.rows[0];

    // A disabled account must not be able to mint new access tokens.
    if (!updated.is_active) {
      await revokeAllRefreshTokensForUser(userId);
    }

    logAuditEvent(
      req,
      updated.is_active ? "Admin User Activated" : "Admin User Deactivated",
      "user",
      userId,
      { is_active: existing.rows[0].is_active },
      { is_active: updated.is_active, email: updated.email }
    );

    return sendSuccess(
      res,
      updated,
      updated.is_active ? "User activated successfully" : "User deactivated successfully"
    );
  })
);

/**
 * @swagger
 * /api/admin/audit-log:
 *   get:
 *     summary: Recent audit log entries
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Audit entries
 */
app.get(
  "/api/admin/audit-log",
  requireAuth,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const parsedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 25;

    const result = await pool.query(
      `SELECT id, user_id, user_name, user_role, action_type, entity_type,
              entity_id, endpoint, method, ip_address, created_at
         FROM audit_logs
        ORDER BY created_at DESC, id DESC
        LIMIT $1`,
      [limit]
    );

    return sendSuccess(res, result.rows);
  })
);

// ─── Signature upload routes ──────────────────────────────────────────────────
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

    const filename = generateSecureFilename(req.user.id, "signature", req.file.originalname);

    const uploadResult = await storageService.uploadFile(req.file.buffer, filename, "signature");
    if (uploadResult.error) {
      throw new AppError(uploadResult.error, 400);
    }

    const existing = await signatureService.getUserSignature(req.user.id);

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

    const filename = generateSecureFilename(req.user.id, "signature", req.file.originalname);

    const uploadResult = await storageService.uploadFile(req.file.buffer, filename, "signature");
    if (uploadResult.error) {
      throw new AppError(uploadResult.error, 400);
    }

    const existing = await signatureService.getUserSignature(req.user.id);

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
      throw new AppError("Insufficient permissions", 403, "FORBIDDEN");
    }

    const documents = await pdfGovernanceService.getApprovedDocumentsByJob(jobId);
    return sendSuccess(res, documents);
  })
);

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

    const jobResult = await pool.query(
      "SELECT id, status, approved_by_id, approved_by, manager_id FROM job_master WHERE id = $1",
      [jobId]
    );
    if (jobResult.rows.length === 0) {
      throw new AppError("Job not found", 404);
    }

    const job = jobResult.rows[0];

    if (req.user.role === "manager" && job.manager_id !== req.user.id) {
      throw new AppError("Insufficient permissions", 403, "FORBIDDEN");
    }

    if (job.status !== "APPROVED") {
      throw new AppError("Job must be in APPROVED status to upload documents", 400);
    }

    const filename = generateSecureFilename(req.user.id, "document", req.file.originalname);

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

// ─── Serve frontend (must be after all API routes) ────────────────────────────

// FIX 2: Use __dirname-relative path so Azure resolves dist correctly
app.use(express.static(path.join(__dirname, "dist")));

// FIX 3: API 404 handler — catches unmatched /api/* routes BEFORE the frontend
// catch-all so they return JSON instead of index.html
app.use("/api", (_req, res) => {
  res.status(404).json({
    success: false,
    error: { code: "NOT_FOUND", message: "API route not found" },
  });
});

// FIX 4: Frontend catch-all — Express 5 compatible wildcard route
// This replaces app.get("*", ...), which crashes with path-to-regexp in Express 5.
app.get("/{*splat}", (_req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

// ─── Global error handler (must be last) ─────────────────────────────────────
// FIX 5: Moved errorHandler AFTER the catch-all routes so it can handle
// errors thrown from any route including the SPA fallback
app.use(errorHandler);

// ─── Validate required env vars before starting ───────────────────────────────
if (!process.env.ACCESS_TOKEN_SECRET && !process.env.JWT_SECRET) {
  logger.error("FATAL: ACCESS_TOKEN_SECRET or JWT_SECRET environment variable is required", {
    eventType: "startup",
  });
  process.exit(1);
}

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

  // ─── Start background workers (skip if DATABASE_URL not yet configured) ───
  if (!process.env.DATABASE_URL) {
    logger.warn("DATABASE_URL is not set — skipping worker manager startup. Add it to Azure App Service Configuration when ready.", {
      eventType: "startup",
    });
    return;
  }

  try {
    await workerManager.start();
    logger.info("Worker manager started successfully", { eventType: "startup" });
  } catch (error) {
    logger.error("Worker manager failed to start — server will continue without background workers", {
      eventType: "startup",
      error: error.message,
      stack: error.stack,
    });
    // Do NOT crash — HTTP server stays alive
  }
});