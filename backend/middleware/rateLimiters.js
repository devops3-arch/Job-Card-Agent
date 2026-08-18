import rateLimit, { ipKeyGenerator } from "express-rate-limit";

import logger from "../services/logger/logger.js";

// express-rate-limit v8 exports ipKeyGenerator as a helper taking an IP string, not
// as a keyGenerator itself. Passing it directly means it receives (req, res) and
// never produces a usable key, which silently disables the limiter it is attached
// to — that is why login had no working brute-force protection.
export const ipKey = (req) => ipKeyGenerator(req.ip || "unknown");

export const buildKey = (req) => {
  if (req.user?.id) {
    return `user:${req.user.id}`;
  }
  return ipKey(req);
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

// Static assets are excluded from the global budget. The limiter keys on IP, and
// behind an office NAT every engineer shares one key — counting the single-page
// app's own bundle and the evidence photos it renders would exhaust the window in
// a couple of page loads and make the app look broken. The per-route limiters
// below (auth, admin, upload) are what actually guard against abuse.
export const isStaticAssetRequest = (req) =>
  req.method === "GET" &&
  (req.path.startsWith("/assets/") ||
    req.path.startsWith("/uploads/") ||
    /\.(js|mjs|css|map|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|eot|mp3|wav|m4a|pdf)$/i.test(req.path));

export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.GLOBAL_RATE_LIMIT_MAX) || 1000,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKey,
  skip: isStaticAssetRequest,
  handler: createRateLimitHandler("Too many requests", "Rate limit triggered"),
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKey,
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
