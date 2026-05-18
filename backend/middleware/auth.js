import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import AppError from "../utils/AppError.js";
import { logAuditEvent } from "../audit.js";
import * as tokenService from "../services/tokenService.js";

dotenv.config();

const getAccessTokenSecret = () => {
  const secret = process.env.ACCESS_TOKEN_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("ACCESS_TOKEN_SECRET or JWT_SECRET environment variable is required");
  }
  return secret;
};

const verifyJwtToken = (token) => {
  const accessSecret = getAccessTokenSecret();
  try {
    return jwt.verify(token, accessSecret);
  } catch (primaryError) {
    if (process.env.JWT_SECRET && process.env.JWT_SECRET !== accessSecret) {
      try {
        return jwt.verify(token, process.env.JWT_SECRET);
      } catch (fallbackError) {
        throw primaryError;
      }
    }
    throw primaryError;
  }
};

export const generateToken = (user) => {
  return tokenService.generateAccessToken(user);
};

const getDevUser = (req) => {
  if (process.env.NODE_ENV === "production") {
    return null;
  }

  const role = String(req.headers["x-dev-user-role"] ?? "").trim().toLowerCase();
  const idHeader = String(req.headers["x-dev-user-id"] ?? "").trim();
  if (!role || !["engineer", "manager", "admin"].includes(role)) {
    return null;
  }

  const id = Number(idHeader) || (role === "manager" ? 2 : role === "admin" ? 3 : 1);
  return { id, role };
};

export const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    try {
      const decoded = verifyJwtToken(token);
      req.user = decoded;
      return next();
    } catch (err) {
      logAuditEvent(req, "Unauthorized Access Attempt", "auth", null, null, {
        reason: "Invalid or expired token",
      });
      throw new AppError("Invalid or expired token", 401, "AUTH_INVALID_TOKEN");
    }
  }

  const devUser = getDevUser(req);
  if (devUser) {
    req.user = devUser;
    return next();
  }

  logAuditEvent(req, "Unauthorized Access Attempt", "auth", null, null, {
    reason: "Authorization header with Bearer token required",
  });
  throw new AppError("Authorization header with Bearer token required", 401, "AUTH_HEADER_REQUIRED");
};

export const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      throw new AppError("Authentication required", 401, "AUTH_REQUIRED");
    }
    if (!allowedRoles.includes(req.user.role)) {
      logAuditEvent(req, "Unauthorized Access Attempt", "auth", null, {
        role: req.user.role,
      }, {
        requiredRoles: allowedRoles,
        endpoint: req.originalUrl,
        method: req.method,
      });
      throw new AppError("Insufficient permissions", 403, "FORBIDDEN");
    }
    next();
  };
};

export const requireDevOrAdmin = (req, res, next) => {
  if (process.env.NODE_ENV !== "production") {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    try {
      const decoded = verifyJwtToken(token);
      req.user = decoded;
    } catch (err) {
      logAuditEvent(req, "Blocked Dev User Creation Attempt", "auth", null, null, {
        reason: "Invalid or expired token",
        endpoint: req.originalUrl,
        method: req.method,
      });
      throw new AppError("Invalid or expired token", 401, "AUTH_INVALID_TOKEN");
    }
  } else {
    const devUser = getDevUser(req);
    if (devUser) {
      req.user = devUser;
    }
  }

  if (!req.user) {
    logAuditEvent(req, "Blocked Dev User Creation Attempt", "auth", null, null, {
      reason: "Authorization header with Bearer token required",
      endpoint: req.originalUrl,
      method: req.method,
    });
    throw new AppError("Authorization header with Bearer token required", 401, "AUTH_HEADER_REQUIRED");
  }

  if (req.user.role !== "admin") {
    logAuditEvent(req, "Blocked Dev User Creation Attempt", "auth", null, null, {
      role: req.user.role,
      requiredRoles: ["admin"],
      endpoint: req.originalUrl,
      method: req.method,
    });
    throw new AppError("Insufficient permissions", 403, "FORBIDDEN");
  }

  next();
};
