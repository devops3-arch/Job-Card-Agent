import express from "express";

import { isConfigured as isEmailConfigured } from "../services/email/emailService.js";
import { isConfigured as isZohoConfigured } from "../services/zoho/index.js";

const router = express.Router();

/**
 * Integration status.
 *
 * Reports what is actually wired up rather than a fixed "available" for each.
 * A monitoring endpoint that always claims success is worse than none, because
 * somebody eventually trusts it.
 *
 *   configured      — credentials present, calls will be attempted
 *   not_configured  — implemented, but missing the key or URL it needs
 */
router.get("/status", (req, res) => {
  const data = {
    email: isEmailConfigured() ? "configured" : "not_configured",
    openai: process.env.OPENAI_API_KEY ? "configured" : "not_configured",
    n8n:
      process.env.N8N_JOB_APPROVAL_WEBHOOK_URL || process.env.N8N_WEBHOOK_URL
        ? "configured"
        : "not_configured",
    storage: process.env.STORAGE_PROVIDER === "azure"
      ? (process.env.AZURE_STORAGE_CONNECTION_STRING ? "configured" : "not_configured")
      : "local",
    workers: process.env.WORKER_ENABLED === "true" ? "enabled" : "disabled",
    zoho: isZohoConfigured() ? "configured" : "not_configured",
  };

  const degraded = Object.entries(data)
    .filter(([, value]) => value === "not_configured" || value === "not_implemented")
    .map(([key]) => key);

  res.status(200).json({
    success: true,
    message: degraded.length
      ? `Integrations needing attention: ${degraded.join(", ")}`
      : "All integrations configured",
    data,
  });
});

export default router;
