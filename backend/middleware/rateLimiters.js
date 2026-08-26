import rateLimit, { ipKeyGenerator } from "express-rate-limit";

import logger from "../services/logger/logger.js";

const buildKey = (req) => {
  if (req.user?.id) {
    return `user:${req.user.id}`;
  }
  return req.ip || "unknown";
};

const createRateLimitHandler = (message, logTag) => (req, res) => {
  logger.warn(`${logTag} triggered`, {
    eventType: "security",
    ip: req.ip,
    url: req.originalUrl,
  });
  return res.status(429).json({
    success: false,
    error: message,
  });
};

export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKeyGenerator,
  handler: createRateLimitHandler("Too many requests", "Rate limit triggered"),
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKeyGenerator,
  handler: createRateLimitHandler(
    "Too many login attempts. Please try again later.",
    "Auth limiter triggered"
  ),
});

export const adminActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => buildKey(req),
  handler: createRateLimitHandler(
    "Too many admin actions. Please try again later.",
    "Admin action limiter triggered"
  ),
});

export const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => buildKey(req),
  handler: createRateLimitHandler(
    "Too many uploads. Please try again later.",
    "Upload limiter triggered"
  ),
});
