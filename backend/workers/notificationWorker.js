import logger from "../services/logger/logger.js";
import { markNotificationSent, markNotificationFailed } from "../services/workers/queueProcessor.js";
import { deliverNotificationEmail, isEmailable } from "../services/email/notificationMailer.js";

/**
 * Notification Worker
 * Processes individual notification queue items.
 * Job lifecycle events are delivered by email when SMTP is configured; security
 * and audit events are recorded without a delivery channel by design.
 */

const log = (message, extra = {}) => {
  logger.debug(message, { eventType: "notification_worker", ...extra });
};

const errorLog = (message, error, extra = {}) => {
  logger.error(message, {
    eventType: "notification_worker",
    error: error.message,
    stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    ...extra,
  });
};

/**
 * Delivers a single notification.
 *
 * Job lifecycle notifications are emailed when SMTP is configured. Security and
 * audit events (login, logout, token refresh, general activity) are deliberately
 * never emailed — they exist for the audit trail, and an email per login would be
 * noise. Those are recorded and acknowledged.
 *
 * @param {Object} notification - Notification record with event data
 * @returns {Promise<boolean>} true when handled, false to leave it for a retry
 */
const deliverNotification = async (notification) => {
  const {
    id: notificationId,
    notification_type,
    recipient_role,
    recipient_user_id,
    event_type,
    entity_type,
    entity_id,
  } = notification;

  log("Processing notification", {
    notificationId,
    notificationType: notification_type,
    recipientRole: recipient_role,
    recipientUserId: recipient_user_id,
    eventType: event_type,
    entityType: entity_type,
    entityId: entity_id,
  });

  if (!isEmailable(notification_type)) {
    // Audit-only by design. Acknowledged so it leaves the queue rather than
    // retrying forever against a channel it was never meant to use.
    log("Notification recorded for audit only, no delivery channel applies", {
      notificationId,
      notificationType: notification_type,
    });
    return true;
  }

  const delivery = await deliverNotificationEmail(notification);

  if (delivery.error) {
    errorLog("Notification email failed", new Error(delivery.error), {
      notificationId,
      notificationType: notification_type,
    });
    return false;
  }

  if (delivery.sent) {
    log("Notification emailed", {
      notificationId,
      notificationType: notification_type,
      recipients: delivery.recipients,
    });
    return true;
  }

  // Nothing was sent, and saying otherwise in the log would be a lie. This is the
  // normal state on a deployment with no SMTP_HOST, or when the recipient role has
  // no active users to address.
  log("Notification not delivered: no email channel configured or no recipients", {
    notificationId,
    notificationType: notification_type,
    recipients: delivery.recipients ?? 0,
  });
  return true;
};

/**
 * Processes a single notification
 * Handles the complete lifecycle: processing -> success/failure -> database update
 *
 * @param {Object} notification - Notification record to process
 * @param {number} maxRetries - Maximum retry attempts
 */
export const processNotification = async (notification, maxRetries = 5) => {
  const notificationId = notification.id;

  try {
    log("Starting notification processing", { notificationId });

    const success = await deliverNotification(notification);

    if (success) {
      await markNotificationSent(notificationId);
      log("Notification processed successfully", { notificationId });
    } else {
      await markNotificationFailed(notificationId, "Delivery failed", maxRetries);
      log("Notification processing failed", { notificationId });
    }
  } catch (error) {
    const errorMessage = error.message || "Unknown processing error";
    errorLog("Critical error during notification processing", error, { notificationId });

    try {
      await markNotificationFailed(notificationId, errorMessage, maxRetries);
    } catch (dbError) {
      errorLog("Failed to update notification status after processing error", dbError, {
        notificationId,
        originalError: errorMessage,
      });
    }
  }
};

/**
 * Batch processes multiple notifications
 * Useful for bulk processing scenarios
 *
 * @param {Array} notifications - Array of notification records
 * @param {number} maxRetries - Maximum retry attempts
 * @param {number} concurrency - Maximum concurrent processing (default: 3)
 */
export const processNotificationsBatch = async (notifications, maxRetries = 5, concurrency = 3) => {
  log("Starting batch notification processing", {
    batchSize: notifications.length,
    concurrency,
  });

  // Process in batches with limited concurrency
  const batches = [];
  for (let i = 0; i < notifications.length; i += concurrency) {
    batches.push(notifications.slice(i, i + concurrency));
  }

  for (const batch of batches) {
    await Promise.allSettled(
      batch.map(notification => processNotification(notification, maxRetries))
    );
  }

  log("Batch notification processing completed", {
    totalProcessed: notifications.length,
  });
};

export default {
  processNotification,
  processNotificationsBatch,
};