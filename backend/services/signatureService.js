import pool from "../db.js";
import AppError from "../utils/AppError.js";

const ALLOWED_SIGNATURE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/svg+xml",
]);

const MAX_SIGNATURE_FILE_SIZE = 2 * 1024 * 1024; // 2MB

const sanitizeFileName = (fileName) => {
  if (!fileName) return "signature";
  return fileName
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 200);
};

export const validateSignaturePayload = ({ signature_url, file_type, file_size, file_name }) => {
  if (!signature_url || typeof signature_url !== "string") {
    throw new AppError("Signature URL is required", 400, "SIGNATURE_URL_REQUIRED");
  }
  if (!ALLOWED_SIGNATURE_MIME_TYPES.has(file_type)) {
    throw new AppError(
      "Unsupported signature file type",
      400,
      "SIGNATURE_INVALID_TYPE"
    );
  }
  if (typeof file_size !== "number" || file_size <= 0 || file_size > MAX_SIGNATURE_FILE_SIZE) {
    throw new AppError(
      "Signature file size must be between 1 byte and 2MB",
      400,
      "SIGNATURE_INVALID_SIZE"
    );
  }
  return {
    signature_url: signature_url.trim(),
    file_type,
    file_size,
    file_name: sanitizeFileName(file_name),
  };
};

export const generateSignaturePath = ({ user, fileName, fileType }) => {
  const extension = fileType === "image/svg+xml" ? "svg" : fileType.split("/")[1] || "png";
  const sanitizedFileName = sanitizeFileName(fileName || `signature-${user.id}`);
  return `signatures/${user.role}/${user.id}/${Date.now()}-${sanitizedFileName}.${extension}`;
};

export const getUserSignature = async (userId) => {
  const result = await pool.query(
    `SELECT id, name, email, role, signature_url, signature_uploaded_at
     FROM users WHERE id = $1`,
    [userId]
  );
  return result.rows[0] ?? null;
};

export const upsertUserSignature = async ({ userId, signature_url }) => {
  const result = await pool.query(
    `UPDATE users
     SET signature_url = $1, signature_uploaded_at = CURRENT_TIMESTAMP
     WHERE id = $2
     RETURNING id, name, email, role, signature_url, signature_uploaded_at`,
    [signature_url, userId]
  );
  if (result.rows.length === 0) {
    console.error('[signatureService.upsertUserSignature] No rows updated for userId:', userId);
  }
  return result.rows[0];
};
