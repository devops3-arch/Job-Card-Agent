import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pool from "./db.js";

dotenv.config();

const app = express();

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ─── Response helpers ─────────────────────────────────────────────────────────
const sendSuccess = (res, data, statusCode = 200) =>
    res.status(statusCode).json({ success: true, data });

const sendError = (res, statusCode, message, error = null) => {
    const body = { success: false, message };
    if (error) body.error = String(error);
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

// ─── Health checks ────────────────────────────────────────────────────────────
app.get("/", (_req, res) => res.send("Backend is running"));

app.get("/test-db", async (_req, res) => {
    try {
        const result = await pool.query("SELECT NOW()");
        return sendSuccess(res, { time: result.rows[0] });
    } catch (err) {
        console.error("test-db error:", err);
        return sendError(res, 500, "Database connection failed", err.message);
    }
});

// ─── POST /jobs ───────────────────────────────────────────────────────────────
// Creates a new job with structured fields, JSONB backup, and relational parts/labor rows.
app.post("/jobs", async (req, res) => {
    const payload = req.body ?? {};

    // Validation
    const customer_name = (payload.customer_name ?? "").trim();
    if (!customer_name || customer_name.length < 2)
        return sendError(res, 400, "customer_name is required and must be at least 2 characters");

    const job_card_no = (payload.job_card_no ?? "").trim();
    if (!job_card_no)
        return sendError(res, 400, "job_card_no is required");

    if (payload.email && !isValidEmail(payload.email))
        return sendError(res, 400, "email is not valid");

    if (payload.job_date && !isValidDate(payload.job_date))
        return sendError(res, 400, "job_date is not a valid date");

    const parts = payload.parts ?? [];
    const labor = payload.labor ?? [];

    if (!Array.isArray(parts))
        return sendError(res, 400, "parts must be an array");
    if (!Array.isArray(labor))
        return sendError(res, 400, "labor must be an array");

    const mappedParts = parts.map(mapPart);
    const mappedLabor = labor.map(mapLabor);

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        const jobResult = await client.query(
            `INSERT INTO job_master (
                customer_name, ref_no, job_card_no, job_date, customer_code,
                attention_of, email, contact_no, sales_area, under_warranty,
                equipment_name, service_type, other_expenses, discount_percentage,
                status, parts, labor, compressor_checklist, dryer_checklist, job_data
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
            RETURNING *`,
            [
                customer_name,
                payload.ref_no       ?? null,
                job_card_no,
                payload.job_date     ?? null,
                payload.customer_code ?? null,
                payload.attention_of  ?? null,
                payload.email         ?? null,
                payload.contact_no    ?? null,
                payload.sales_area    ?? null,
                payload.under_warranty ?? false,
                (payload.equipment_name ?? "").trim() || null,
                payload.service_type   ?? null,
                toNum(payload.other_expenses),
                toNum(payload.discount_percentage),
                "WAITING_PRICING",
                JSON.stringify(parts),
                JSON.stringify(labor),
                JSON.stringify(payload.compressor_checklist ?? []),
                JSON.stringify(payload.dryer_checklist      ?? []),
                JSON.stringify(payload),
            ]
        );

        const jobId = jobResult.rows[0].id;

        for (const p of mappedParts) {
            await client.query(
                `INSERT INTO job_parts (job_id, part_name, quantity, unit_price, total)
                 VALUES ($1,$2,$3,$4,$5)`,
                [jobId, p.part_name, p.quantity, p.unit_price, p.total]
            );
        }

        for (const l of mappedLabor) {
            await client.query(
                `INSERT INTO job_labor (job_id, description, hours, rate, total)
                 VALUES ($1,$2,$3,$4,$5)`,
                [jobId, l.description, l.hours, l.rate, l.total]
            );
        }

        await client.query("COMMIT");

        return sendSuccess(res, {
            job: jobResult.rows[0],
            parts_inserted: mappedParts.length,
            labor_inserted: mappedLabor.length,
        }, 201);

    } catch (err) {
        await client.query("ROLLBACK");
        console.error("POST /jobs error:", err);
        return sendError(res, 500, "Failed to create job", err.message);
    } finally {
        client.release();
    }
});

// ─── GET /jobs ────────────────────────────────────────────────────────────────
// Returns list/dashboard data. Uses LATERAL join to get the latest pricing row
// per job — avoids duplicate job rows when multiple pricing rows exist.
app.get("/jobs", async (_req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                jm.id,
                jm.customer_name,
                jm.equipment_name,
                jm.status,
                jm.ref_no,
                jm.job_card_no,
                jm.job_date,
                jm.customer_code,
                jm.attention_of,
                jm.email,
                jm.contact_no,
                jm.sales_area,
                jm.under_warranty,
                jm.service_type,
                jm.other_expenses,
                jm.discount_percentage,
                jm.created_at,
                ph.grand_total
            FROM job_master jm
            LEFT JOIN LATERAL (
                SELECT grand_total
                FROM pricing_header
                WHERE job_id = jm.id
                ORDER BY created_at DESC
                LIMIT 1
            ) ph ON true
            ORDER BY jm.created_at DESC
        `);

        return sendSuccess(res, result.rows);
    } catch (err) {
        console.error("GET /jobs error:", err);
        return sendError(res, 500, "Failed to fetch jobs", err.message);
    }
});

// ─── GET /jobs/:id ────────────────────────────────────────────────────────────
// Returns full job detail including parts, labor, and latest pricing.
// Used by PDF/Excel generation, manager view, and AI insights.
app.get("/jobs/:id", async (req, res) => {
    const jobId = Number(req.params.id);
    if (!Number.isInteger(jobId) || jobId <= 0)
        return sendError(res, 400, "Invalid job id");

    try {
        const jobResult = await pool.query(
            "SELECT * FROM job_master WHERE id = $1",
            [jobId]
        );
        if (jobResult.rows.length === 0)
            return sendError(res, 404, "Job not found");

        const [partsResult, laborResult, pricingResult] = await Promise.all([
            pool.query("SELECT * FROM job_parts  WHERE job_id = $1 ORDER BY id", [jobId]),
            pool.query("SELECT * FROM job_labor  WHERE job_id = $1 ORDER BY id", [jobId]),
            pool.query(
                "SELECT * FROM pricing_header WHERE job_id = $1 ORDER BY created_at DESC LIMIT 1",
                [jobId]
            ),
        ]);

        return sendSuccess(res, {
            job:     jobResult.rows[0],
            parts:   partsResult.rows,
            labor:   laborResult.rows,
            pricing: pricingResult.rows[0] ?? null,
        });
    } catch (err) {
        console.error("GET /jobs/:id error:", err);
        return sendError(res, 500, "Failed to fetch job", err.message);
    }
});

// ─── POST /jobs/:id/pricing ───────────────────────────────────────────────────
// Upserts pricing for a job: deletes any existing pricing row, then inserts a
// fresh one. This keeps pricing_header at one row per job and prevents stale
// accumulation. Approval is a separate step.
app.post("/jobs/:id/pricing", async (req, res) => {
    const jobId = Number(req.params.id);
    if (!Number.isInteger(jobId) || jobId <= 0)
        return sendError(res, 400, "Invalid job id");

    try {
        const jobCheck = await pool.query(
            "SELECT id FROM job_master WHERE id = $1",
            [jobId]
        );
        if (jobCheck.rows.length === 0)
            return sendError(res, 404, "Job not found");

        const body = req.body ?? {};
        const requiredFields = [
            "parts_total", "labour_total", "taxable_amount", "vat_amount", "grand_total",
        ];
        for (const field of requiredFields) {
            if (body[field] === null || body[field] === undefined)
                return sendError(res, 400, `${field} is required`);
        }

        const labour_rate    = toNum(body.labour_rate);
        const service_charge = toNum(body.service_charge);
        const discount       = toNum(body.discount);
        const vat_percent    = toNum(body.vat_percent, 5);
        const parts_total    = toNum(body.parts_total);
        const labour_total   = toNum(body.labour_total);
        const taxable_amount = toNum(body.taxable_amount);
        const vat_amount     = toNum(body.vat_amount);
        const grand_total    = toNum(body.grand_total);

        // Reject negative values
        const numericFields = {
            labour_rate, service_charge, discount,
            parts_total, labour_total, taxable_amount, vat_amount, grand_total,
        };
        for (const [field, val] of Object.entries(numericFields)) {
            if (val < 0)
                return sendError(res, 400, `${field} cannot be negative`);
        }

        const client = await pool.connect();
        try {
            await client.query("BEGIN");

            // Delete old pricing for this job (upsert by replacement)
            await client.query("DELETE FROM pricing_header WHERE job_id = $1", [jobId]);

            const result = await client.query(
                `INSERT INTO pricing_header
                    (job_id, labour_rate, service_charge, discount, vat_percent,
                     parts_total, labour_total, taxable_amount, vat_amount, grand_total)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                 RETURNING *`,
                [
                    jobId, labour_rate, service_charge, discount, vat_percent,
                    parts_total, labour_total, taxable_amount, vat_amount, grand_total,
                ]
            );

            await client.query("COMMIT");
            return sendSuccess(res, result.rows[0]);

        } catch (err) {
            await client.query("ROLLBACK");
            throw err;
        } finally {
            client.release();
        }

    } catch (err) {
        console.error("POST /jobs/:id/pricing error:", err);
        return sendError(res, 500, "Failed to save pricing", err.message);
    }
});

// ─── PUT /jobs/:id/status ─────────────────────────────────────────────────────
// Updates job status. Backend is the source of truth.
// APPROVED and CLOSED jobs are immutable.
// Approval requires a pricing row with grand_total > 0.
app.put("/jobs/:id/status", async (req, res) => {
    const jobId = Number(req.params.id);
    if (!Number.isInteger(jobId) || jobId <= 0)
        return sendError(res, 400, "Invalid job id");

    const { status } = req.body ?? {};
    if (!status)
        return sendError(res, 400, "status is required");
    if (!ALLOWED_STATUSES.includes(status))
        return sendError(res, 400, `status must be one of: ${ALLOWED_STATUSES.join(", ")}`);

    try {
        const jobResult = await pool.query(
            "SELECT id, status FROM job_master WHERE id = $1",
            [jobId]
        );
        if (jobResult.rows.length === 0)
            return sendError(res, 404, "Job not found");

        const currentStatus = jobResult.rows[0].status;

        if (currentStatus === "APPROVED" || currentStatus === "CLOSED")
            return sendError(res, 400, `Job is already ${currentStatus} and cannot be changed`);

        if (status === "APPROVED") {
            const pricingResult = await pool.query(
                "SELECT grand_total FROM pricing_header WHERE job_id = $1 ORDER BY created_at DESC LIMIT 1",
                [jobId]
            );
            if (pricingResult.rows.length === 0)
                return sendError(res, 400, "Cannot approve job without pricing");
            if (toNum(pricingResult.rows[0].grand_total) <= 0)
                return sendError(res, 400, "Cannot approve job: grand_total must be greater than 0");
        }

        const updated = await pool.query(
            "UPDATE job_master SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
            [status, jobId]
        );

        return sendSuccess(res, updated.rows[0]);

    } catch (err) {
        console.error("PUT /jobs/:id/status error:", err);
        return sendError(res, 500, "Failed to update job status", err.message);
    }
});

// ─── Start server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));