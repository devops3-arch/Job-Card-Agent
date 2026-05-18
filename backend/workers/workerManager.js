import logger from "../services/logger/logger.js";
import { fetchPendingNotifications, getQueueStats } from "../services/workers/queueProcessor.js";
import { processNotification } from "./notificationWorker.js";

/**
 * Worker Manager
 * Manages the notification queue processing lifecycle
 * Handles polling, graceful shutdown, and worker coordination
 */

const log = (message, extra = {}) => {
  logger.info(message, { eventType: "worker_manager", ...extra });
};

const errorLog = (message, error, extra = {}) => {
  logger.error(message, {
    eventType: "worker_manager",
    error: error.message,
    stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    ...extra,
  });
};

class WorkerManager {
  constructor() {
    this.isRunning = false;
    this.pollInterval = null;
    this.pollIntervalMs = parseInt(process.env.WORKER_POLL_INTERVAL_MS) || 5000;
    this.maxRetries = 5;
    this.batchSize = 10;
    this.shutdownTimeout = 30000; // 30 seconds
    this.isShuttingDown = false;

    // Graceful shutdown handlers
    this.setupShutdownHandlers();
  }

  /**
   * Sets up graceful shutdown handlers
   */
  setupShutdownHandlers() {
    const shutdown = async (signal) => {
      log(`Received ${signal}, initiating graceful shutdown`);
      await this.stop();
      process.exit(0);
    };

    // Handle common termination signals
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      errorLog("Uncaught exception in worker manager", error);
      this.stop().finally(() => process.exit(1));
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      errorLog("Unhandled promise rejection in worker manager", new Error(reason), { promise });
      this.stop().finally(() => process.exit(1));
    });
  }

  /**
   * Starts the worker manager
   */
  async start() {
    if (this.isRunning) {
      log("Worker manager is already running");
      return;
    }

    // Check if workers are enabled
    if (process.env.WORKER_ENABLED !== 'true') {
      log("Workers are disabled via WORKER_ENABLED environment variable");
      return;
    }

    this.isRunning = true;
    this.isShuttingDown = false;

    log("Starting notification worker manager", {
      pollIntervalMs: this.pollIntervalMs,
      batchSize: this.batchSize,
      maxRetries: this.maxRetries,
    });

    // Start the polling loop
    this.startPolling();

    // Log initial queue stats
    await this.logQueueStats();
  }

  /**
   * Stops the worker manager gracefully
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    log("Stopping notification worker manager");
    this.isShuttingDown = true;
    this.isRunning = false;

    // Clear the polling interval
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    // Wait for any in-flight processing to complete
    // In a more sophisticated implementation, we'd track active jobs
    await new Promise(resolve => setTimeout(resolve, 1000));

    log("Notification worker manager stopped");
  }

  /**
   * Starts the polling loop
   */
  startPolling() {
    // Process immediately on start
    this.processQueue();

    // Then poll at regular intervals
    this.pollInterval = setInterval(() => {
      if (!this.isShuttingDown) {
        this.processQueue();
      }
    }, this.pollIntervalMs);
  }

  /**
   * Processes the notification queue
   */
  async processQueue() {
    if (this.isShuttingDown) {
      return;
    }

    try {
      // Fetch pending notifications
      const notifications = await fetchPendingNotifications(this.batchSize);

      if (notifications.length === 0) {
        // Log less frequently when queue is empty
        if (Math.random() < 0.1) { // 10% chance to log
          log("No pending notifications found");
        }
        return;
      }

      log(`Processing ${notifications.length} notifications`);

      // Process notifications (in production, could use worker threads or child processes)
      const processPromises = notifications.map(notification =>
        this.processNotificationSafe(notification)
      );

      // Wait for all processing to complete
      await Promise.allSettled(processPromises);

      log(`Completed processing batch of ${notifications.length} notifications`);

      // Log queue stats periodically
      await this.logQueueStats();

    } catch (error) {
      errorLog("Error in queue processing loop", error);
    }
  }

  /**
   * Safely processes a single notification with error handling
   */
  async processNotificationSafe(notification) {
    try {
      await processNotification(notification, this.maxRetries);
    } catch (error) {
      errorLog("Failed to process notification in batch", error, {
        notificationId: notification.id,
        notificationType: notification.notification_type,
      });
    }
  }

  /**
   * Logs current queue statistics
   */
  async logQueueStats() {
    try {
      const stats = await getQueueStats();
      log("Queue statistics", stats);
    } catch (error) {
      errorLog("Failed to log queue statistics", error);
    }
  }

  /**
   * Gets the current status of the worker manager
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      isShuttingDown: this.isShuttingDown,
      pollIntervalMs: this.pollIntervalMs,
      batchSize: this.batchSize,
      maxRetries: this.maxRetries,
      lastPollTime: this.lastPollTime,
    };
  }

  /**
   * Manually triggers queue processing (useful for testing)
   */
  async triggerProcessing() {
    if (!this.isRunning) {
      log("Cannot trigger processing - worker manager is not running");
      return;
    }

    log("Manually triggering queue processing");
    await this.processQueue();
  }
}

// Create singleton instance
const workerManager = new WorkerManager();

export default workerManager;

// Export individual functions for testing
export { WorkerManager };