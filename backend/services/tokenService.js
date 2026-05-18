import crypto from "crypto";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import pool from "../db.js";

dotenv.config();

const getAccessTokenSecret = () => {
  const secret = process.env.ACCESS_TOKEN_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("ACCESS_TOKEN_SECRET or JWT_SECRET environment variable is required");
  }
  return secret;
};

const getRefreshTokenSecret = () => process.env.REFRESH_TOKEN_SECRET || null;

const executeQuery = async (client, text, params) => {
  if (client) {
    return client.query(text, params);
  }
  return pool.query(text, params);
};

export const generateAccessToken = (user) => {
  const secret = getAccessTokenSecret();
  const expiresIn = process.env.ACCESS_TOKEN_EXPIRY || "15m";
  const payload = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
  return jwt.sign(payload, secret, { expiresIn });
};

export const generateRefreshToken = () => {
  return crypto.randomBytes(64).toString("hex");
};

export const hashToken = (token) => {
  if (!token || typeof token !== "string") {
    throw new Error("Refresh token is required");
  }
  const secret = getRefreshTokenSecret();
  if (secret) {
    return crypto.createHmac("sha256", secret).update(token).digest("hex");
  }
  return crypto.createHash("sha256").update(token).digest("hex");
};

export const getRefreshTokenExpiresAt = () => {
  const days = Number(process.env.REFRESH_TOKEN_EXPIRY_DAYS ?? 7);
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
};

export const storeRefreshToken = async ({ userId, token, createdByIp = null, userAgent = null, expiresAt = null, client = null }) => {
  const expires = expiresAt || getRefreshTokenExpiresAt();
  const tokenHash = hashToken(token);
  const query = `
    INSERT INTO refresh_tokens
      (user_id, token_hash, expires_at, created_by_ip, user_agent)
    VALUES ($1,$2,$3,$4,$5)
    RETURNING *`;
  const result = await executeQuery(client, query, [userId, tokenHash, expires, createdByIp, userAgent]);
  return result.rows[0];
};

export const findRefreshTokenByHash = async (tokenHash, client = null) => {
  const query = `
    SELECT rt.*, u.name AS user_name, u.email AS user_email, u.role AS user_role, u.signature_url AS user_signature_url
    FROM refresh_tokens rt
    JOIN users u ON rt.user_id = u.id
    WHERE rt.token_hash = $1`;
  const result = await executeQuery(client, query, [tokenHash]);
  return result.rows[0] ?? null;
};

export const revokeRefreshTokenByHash = async (tokenHash, client = null) => {
  const query = `
    UPDATE refresh_tokens
    SET revoked_at = CURRENT_TIMESTAMP
    WHERE token_hash = $1
      AND revoked_at IS NULL`;
  await executeQuery(client, query, [tokenHash]);
};

export const rotateRefreshToken = async ({ oldTokenHash, userId, createdByIp = null, userAgent = null, client }) => {
  const newRefreshToken = generateRefreshToken();
  const newTokenHash = hashToken(newRefreshToken);
  const expiresAt = getRefreshTokenExpiresAt();

  await revokeRefreshTokenByHash(oldTokenHash, client);

  const query = `
    INSERT INTO refresh_tokens
      (user_id, token_hash, expires_at, created_by_ip, user_agent)
    VALUES ($1,$2,$3,$4,$5)
    RETURNING *`;
  const result = await executeQuery(client, query, [userId, newTokenHash, expiresAt, createdByIp, userAgent]);
  return {
    refreshToken: newRefreshToken,
    refreshTokenRecord: result.rows[0],
  };
};

export default {
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  getRefreshTokenExpiresAt,
  storeRefreshToken,
  findRefreshTokenByHash,
  revokeRefreshTokenByHash,
  rotateRefreshToken,
};
