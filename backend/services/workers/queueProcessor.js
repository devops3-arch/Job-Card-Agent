import pool from "../../db.js";
import logger from "../logger/logger.js";

/**
 * Queue Processor Service
 * Handles database operations for notification queue processing
 * Provides duplicate-processing protection using FOR UPDATE SKIP LOCKED
 */

const log = (message, extra = {}) => {
  logger.debug(message, { eventType: "queue_processor", ...extra });
};

const errorLog = (message, error, extra = {}) => {
  logger.error(message, {
    eventType: "queue_processor",
    error: error.message,
    stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    ...extra,
  });
};

/**
 * Fetches pending notifications with duplicate processing protection
 * Uses FOR UPDATE SKIP LOCKED to prevent concurrent processing
 * @param {number} limit - Maximum number of notifications to fetch
 * @returns {Array} Array of notification records with event data
 */
export const fetchPendingNotifications = async (limit = 10) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Fetch and lock pending notifications to prevent duplicate processing
    const fetchQuery = `
      SELECT nq.*, se.event_type, se.entity_type, se.entity_id, se.payload
      FROM notification_queue nq
      JOIN system_events se ON nq.event_id = se.id
      WHERE nq.status = 'PENDING'
      ORDER BY nq.created_at ASC
      LIMIT $1
      FOR UPDATE SKIP LOCKED`;

    const result = await client.query(fetchQuery, [limit]);

    if (result.rows.length === 0) {
      await client.query("COMMIT");
      return [];
    }

    // Mark fetched notifications as PROCESSING
    const notificationIds = result.rows.map(row => row.id);
    const updateQuery = `
      UPDATE notification_queue
      SET status = 'PROCESSING', last_attempt_at = CURRENT_TIMESTAMP
      WHERE id = ANY($1)`;

    await client.query(updateQuery, [notificationIds]);

    await client.query("COMMIT");

    log(`Fetched and locked ${result.rows.length} notifications for processing`, {
      notificationIds,
      limit,
    });

    return result.rows;
  } catch (error) {
    await client.query("ROLLBACK");
    errorLog("Failed to fetch pending notifications", error, { limit });
    return [];
  } finally {
    client.release();
  }
};

/**
 * Marks a notification as successfully processed
 * @param {number} notificationId - ID of the notification
 */
export const markNotificationSent = async (notificationId) => {
  try {
    const query = `
      UPDATE notification_queue
      SET status = 'SENT', processed_at = CURRENT_TIMESTAMP, error_message = NULL
      WHERE id = $1`;

    await pool.query(query, [notificationId]);

    log("Notification marked as sent", { notificationId });
  } catch (error) {
    errorLog("Failed to mark notification as sent", error, { notificationId });
  }
};

/**
 * Marks a notification as failed and handles retry logic
 * @param {number} notificationId - ID of the notification
 * @param {string} errorMessage - Error message from processing
 * @param {number} maxRetries - Maximum number of retry attempts
 */
export const markNotificationFailed = async (notificationId, errorMessage, maxRetries = 5) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Get current retry count
    const selectQuery = "SELECT retry_count FROM notification_queue WHERE id = $1";
    const selectResult = await client.query(selectQuery, [notificationId]);

    if (selectResult.rows.length === 0) {
      log("Notification not found for failure marking", { notificationId });
      await client.query("COMMIT");
      return;
    }

    const currentRetries = selectResult.rows[0].retry_count;
    const newRetryCount = currentRetries + 1;

    // Determine final status based on retry count
    const shouldRetry = newRetryCount < maxRetries;
    const finalStatus = shouldRetry ? 'PENDING' : 'FAILED';

    const updateQuery = `
      UPDATE notification_queue
      SET status = $1, retry_count = $2, error_message = $3, last_attempt_at = CURRENT_TIMESTAMP
      WHERE id = $4`;

    await client.query(updateQuery, [finalStatus, newRetryCount, errorMessage, notificationId]);

    await client.query("COMMIT");

    if (shouldRetry) {
      log("Notification failed, scheduled for retry", {
        notificationId,
        retryCount: newRetryCount,
        maxRetries,
        errorMessage,
      });
    } else {
      log("Notification failed permanently", {
        notificationId,
        retryCount: newRetryCount,
        maxRetries,
        errorMessage,
      });
    }
  } catch (error) {
    await client.query("ROLLBACK");
    errorLog("Failed to mark notification as failed", error, { notificationId, errorMessage });
  } finally {
    client.release();
  }
};

/**
 * Gets notification statistics for monitoring
 * @returns {Object} Statistics about queue status
 */
export const getQueueStats = async () => {
  try {
    const query = `
      SELECT
        status,
        COUNT(*) as count
      FROM notification_queue
      GROUP BY status`;

    const result = await pool.query(query);

    const stats = {
      total: 0,
      pending: 0,
      processing: 0,
      sent: 0,
      failed: 0,
    };

    result.rows.forEach(row => {
      stats[row.status.toLowerCase()] = parseInt(row.count);
      stats.total += parseInt(row.count);
    });

    log("Retrieved queue statistics", stats);
    return stats;
  } catch (error) {
    errorLog("Failed to get queue statistics", error);
    return { total: 0, pending: 0, processing: 0, sent: 0, failed: 0 };
  }
};

export default {
  fetchPendingNotifications,
  markNotificationSent,
  markNotificationFailed,
  getQueueStats,
};