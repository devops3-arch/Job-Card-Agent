import pino from 'pino';

// Create logger configuration based on environment
const createLoggerConfig = () => {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const logLevel = process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info');

  const config = {
    level: logLevel,
    formatters: {
      level: (label) => ({ level: label }),
    },
    serializers: {
      // Sanitize sensitive data
      req: (req) => ({
        method: req.method,
        url: req.url,
        headers: {
          'content-type': req.headers['content-type'],
          'user-agent': req.headers['user-agent'],
          // Exclude sensitive headers
        },
        remoteAddress: req.ip,
        remotePort: req.connection?.remotePort,
      }),
      res: (res) => ({
        statusCode: res.statusCode,
        headers: {
          'content-type': res.getHeader('content-type'),
          'x-request-id': res.getHeader('x-request-id'),
        },
      }),
      err: (err) => ({
        type: err.type,
        message: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
        code: err.code,
        statusCode: err.statusCode,
      }),
    },
  };

  // Pretty printing in development
  if (isDevelopment) {
    config.transport = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    };
  }

  return config;
};

// Create and export the logger instance
const logger = pino(createLoggerConfig());

// Enhanced logging methods with context
export const createRequestLogger = (req) => {
  const baseContext = {
    requestId: req.requestId,
    correlationId: req.correlationId,
    method: req.method,
    url: req.url,
    userId: req.user?.id,
    userRole: req.user?.role,
  };

  return {
    debug: (message, extra = {}) => logger.debug({ ...baseContext, ...extra }, message),
    info: (message, extra = {}) => logger.info({ ...baseContext, ...extra }, message),
    warn: (message, extra = {}) => logger.warn({ ...baseContext, ...extra }, message),
    error: (message, extra = {}) => logger.error({ ...baseContext, ...extra }, message),

    // Specialized logging methods
    auth: (event, extra = {}) => logger.info({ ...baseContext, eventType: 'auth', event, ...extra }, `Auth: ${event}`),
    upload: (event, extra = {}) => logger.info({ ...baseContext, eventType: 'upload', event, ...extra }, `Upload: ${event}`),
    approval: (event, extra = {}) => logger.info({ ...baseContext, eventType: 'approval', event, ...extra }, `Approval: ${event}`),
    event: (eventType, extra = {}) => logger.info({ ...baseContext, eventType, ...extra }, `Event: ${eventType}`),
    queue: (operation, extra = {}) => logger.info({ ...baseContext, eventType: 'queue', operation, ...extra }, `Queue: ${operation}`),
    db: (operation, extra = {}) => logger.debug({ ...baseContext, eventType: 'database', operation, ...extra }, `DB: ${operation}`),
  };
};

// Export the main logger for system-level logging
export default logger;