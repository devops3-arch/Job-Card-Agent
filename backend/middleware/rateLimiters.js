import rateLimit from "express-rate-limit";

import logger from "../services/logger/logger.js";

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
  handler: createRateLimitHandler("Too many requests", "Rate limit triggered"),
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler(
    "Too many login attempts. Please try again later.",
    "Auth limiter triggered"
  ),
});
