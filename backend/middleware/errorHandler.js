import AppError from "../utils/AppError.js";
import { ZodError } from "zod";
import logger from "../services/logger/logger.js";

const formatZodDetails = (error) =>
  error.issues.map((issue) => ({
    path: issue.path.join(".") || "",
    message: issue.message,
    code: issue.code,
  }));

const sanitizePgMessage = (message) => message?.replace(/\r?\n/g, " ").trim();

const handlePostgresError = (err) => {
  const code = err.code;
  switch (code) {
    case "23505":
      return new AppError(
        "Duplicate resource already exists",
        409,
        "DUPLICATE_RESOURCE",
        [{ message: sanitizePgMessage(err.detail) }]
      );
    case "23503":
      return new AppError(
        "Invalid related resource reference",
        400,
        "FOREIGN_KEY_VIOLATION",
        [{ message: sanitizePgMessage(err.detail) }]
      );
    case "22P02":
      return new AppError(
        "Invalid data format",
        400,
        "INVALID_INPUT_SYNTAX",
        [{ message: sanitizePgMessage(err.message) }]
      );
    default:
      return null;
  }
};

const createErrorResponse = (err) => {
  if (err.errorCode === "FORBIDDEN" || err.statusCode === 403) {
    return {
      success: false,
      error: {
        code: "FORBIDDEN",
        message: "You do not have permission to perform this action.",
        details: [],
      },
    };
  }

  return {
    success: false,
    error: {
      code: err.errorCode || "INTERNAL_ERROR",
      message: err.message || "Internal server error",
      details: Array.isArray(err.details) ? err.details : [],
    },
  };
};

const errorHandler = (err, req, res, next) => {
  let error = err;

  if (error instanceof ZodError) {
    error = new AppError("Validation failed", 400, "VALIDATION_ERROR", formatZodDetails(error));
  }

  if (error.type === "entity.too.large" || error.status === 413) {
    const reqLogger = req.logger || logger;
    reqLogger.warn("Oversized payload rejected", {
      eventType: "security",
      error: error.message || error,
      contentLength: req.headers['content-length'],
    });
    error = new AppError("Payload too large", 413, "PAYLOAD_TOO_LARGE");
  }

  if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
    error = new AppError("Malformed JSON payload", 400, "INVALID_JSON_PAYLOAD");
  }

  if (error.name === "JsonWebTokenError") {
    error = new AppError("Unauthorized", 401, "JWT_INVALID_TOKEN");
  }

  if (error.name === "TokenExpiredError") {
    error = new AppError("Token expired", 401, "JWT_EXPIRED_TOKEN");
  }

  if (!(error instanceof AppError)) {
    const pgError = handlePostgresError(error);
    if (pgError) {
      error = pgError;
    }
  }

  if (!(error instanceof AppError)) {
    const reqLogger = req.logger || logger;
    reqLogger.error({
      message: error.message,
      stack: error.stack,
      code: error.code,
      detail: error.detail,
      hint: error.hint,
      position: error.position,
      table: error.table,
      column: error.column,
      constraint: error.constraint,
      schema: error.schema
    }, "Route failure");
    error = new AppError("Internal server error", 500, "INTERNAL_SERVER_ERROR");
  }

  const statusCode = error.statusCode || 500;
  const payload = createErrorResponse(error);

  // Log the final error response
  const reqLogger = req.logger || logger;
  reqLogger.error("Error response sent", {
    eventType: "error",
    statusCode,
    errorCode: error.errorCode,
    message: error.message,
  });

  res.status(statusCode).json(payload);
};

export default errorHandler;
