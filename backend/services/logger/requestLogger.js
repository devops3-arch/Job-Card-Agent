import { randomUUID } from 'crypto';
import logger from './logger.js';

/**
 * Request correlation middleware
 * Adds requestId and correlationId to every request
 * Includes requestId in response headers
 */
export const requestCorrelation = (req, res, next) => {
  // Generate unique IDs for this request
  const requestId = randomUUID();
  const correlationId = req.headers['x-correlation-id'] || requestId;

  // Attach to request object
  req.requestId = requestId;
  req.correlationId = correlationId;

  // Add request ID to response headers
  res.setHeader('X-Request-Id', requestId);
  res.setHeader('X-Correlation-Id', correlationId);

  // Create request-specific logger
  req.logger = logger.child({
    requestId,
    correlationId,
    method: req.method,
    url: req.url,
  });

  // Log incoming request
  req.logger.info('Request received', {
    userAgent: req.headers['user-agent'],
    contentType: req.headers['content-type'],
    contentLength: req.headers['content-length'],
    remoteAddress: req.ip,
  });

  // Track response
  const originalSend = res.send;
  res.send = function(data) {
    // Log response
    req.logger.info('Response sent', {
      statusCode: res.statusCode,
      contentLength: data ? data.length : 0,
      contentType: res.getHeader('content-type'),
    });

    return originalSend.call(this, data);
  };

  next();
};

/**
 * Request logging middleware for detailed request/response logging
 * Use after requestCorrelation middleware
 */
export const requestLogger = (req, res, next) => {
  const startTime = Date.now();

  // Log when response finishes
  res.on('finish', () => {
    const duration = Date.now() - startTime;

    req.logger.info('Request completed', {
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      responseSize: res.getHeader('content-length') || 0,
    });
  });

  // Log on response error
  res.on('error', (error) => {
    req.logger.error('Response error', {
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  });

  next();
};

export default {
  requestCorrelation,
  requestLogger,
};