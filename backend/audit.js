import pool from "./db.js";
import logger from "./services/logger/logger.js";

const SENSITIVE_KEYS = new Set([
  "password",
  "password_hash",
  "token",
  "jwt",
  "refreshToken",
  "accessToken",
  "authorization",
  "auth",
]);

const scrubValue = (value, seen = new WeakSet()) => {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object") return value;
  if (seen.has(value)) return null;
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => scrubValue(item, seen));
  }

  const sanitized = {};
  for (const key of Object.keys(value)) {
    if (SENSITIVE_KEYS.has(key)) continue;
    sanitized[key] = scrubValue(value[key], seen);
  }
  return sanitized;
};

const getIpAddress = (req) => {
  if (!req || typeof req !== "object") return null;
  const header = req.headers?.["x-forwarded-for"];
  if (header) return String(header).split(",")[0].trim();
  if (req.ip) return req.ip;
  if (req.connection?.remoteAddress) return req.connection.remoteAddress;
  return null;
};

const normalizeEntityId = (entityId) => {
  const id = Number(entityId);
  return Number.isInteger(id) ? id : null;
};

export const logAuditEvent = async (
  req,
  actionType,
  entityType,
  entityId,
  oldValues,
  newValues
) => {
  try {
    const userId = req?.user?.id ?? null;
    const userName = req?.user?.name ?? req?.body?.email ?? null;
    const userRole = req?.user?.role ?? null;
    const endpoint = req?.originalUrl || req?.url || null;
    const method = req?.method || null;
    const ipAddress = getIpAddress(req);

    const sanitizedOldValues = scrubValue(oldValues);
    const sanitizedNewValues = scrubValue(newValues);

    const query = `
      INSERT INTO audit_logs
        (user_id, user_name, user_role, action_type, entity_type, entity_id,
         old_values, new_values, endpoint, method, ip_address)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    `;
    const values = [
      userId,
      userName,
      userRole,
      actionType,
      entityType,
      normalizeEntityId(entityId),
      sanitizedOldValues,
      sanitizedNewValues,
      endpoint,
      method,
      ipAddress,
    ];

    pool.query(query, values).then(() => {
      logger.info("Audit log recorded", {
        eventType: "audit",
        actionType,
        userId,
        userName: userName ?? "unknown user",
        entityType,
        entityId,
        ipAddress,
      });
    }).catch((err) => {
      logger.error("Failed to insert audit log", {
        eventType: "audit",
        error: err.message,
        actionType,
        userId,
        entityType,
        entityId,
      });
    });
  } catch (err) {
    logger.error("Unexpected error while logging audit event", {
      eventType: "audit",
      error: err.message,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
  }
};
