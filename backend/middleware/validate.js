import { ZodError } from "zod";
import logger from "../services/logger/logger.js";

const createValidationErrorResponse = (res, details) =>
  res.status(400).json({
    success: false,
    message: "Validation failed",
    error: {
      code: "VALIDATION_ERROR",
      details,
    },
  });

const formatZodDetails = (error) =>
  error.issues.map((issue) => ({
    path: issue.path.join(".") || "",
    message: issue.message,
    code: issue.code,
  }));

const isZodSchema = (value) => value && typeof value.safeParse === "function";

export const validate = (schemas) => {
  return (req, res, next) => {
    try {
      const resolvedSchemas = isZodSchema(schemas)
        ? { body: schemas }
        : schemas || {};

      const validated = {};
      for (const target of ["body", "params", "query"]) {
        const schema = resolvedSchemas[target];
        if (!schema) continue;

        const result = schema.safeParse(req[target]);
        if (!result.success) {
          const details = formatZodDetails(result.error);
          logger.warn("Invalid request payload rejected", {
            eventType: "validation",
            target,
            url: req.originalUrl,
            details,
          });
          return createValidationErrorResponse(res, details);
        }
        validated[target] = result.data;
      }

      if (validated.body) req.body = validated.body;
      if (validated.params) req.params = validated.params;
      if (validated.query) req.query = validated.query;

      logger.debug("Request payload validated", {
        eventType: "validation",
        method: req.method,
        url: req.originalUrl,
      });

      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return createValidationErrorResponse(res, formatZodDetails(err));
      }
      logger.error("Unexpected validation error", {
        eventType: "validation",
        error: err.message,
        stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
      });
      return res.status(500).json({
        success: false,
        error: "Validation pipeline failed",
        details: [{ message: String(err) }],
      });
    }
  };
};
