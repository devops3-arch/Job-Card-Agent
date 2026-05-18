import logger from "../services/logger/logger.js";
import { markNotificationSent, markNotificationFailed } from "../services/workers/queueProcessor.js";

/**
 * Notification Worker
 * Processes individual notification queue items
 * Simulates external service integrations (email, SMS, webhooks, etc.)
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
 * Simulates processing a notification
 * In production, this would integrate with external services:
 * - Email services (SendGrid, SES)
 * - SMS/WhatsApp services (Twilio, WhatsApp Business API)
 * - Webhook dispatch
 * - n8n workflows
 * - Azure Service Bus
 * - etc.
 *
 * @param {Object} notification - Notification record with event data
 * @returns {Promise<boolean>} - True if successful, false if failed
 */
const simulateNotificationProcessing = async (notification) => {
  const {
    id: notificationId,
    notification_type,
    recipient_role,
    recipient_user_id,
    event_type,
    entity_type,
    entity_id,
    payload,
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

  try {
    // Simulate different processing times and potential failures
    // In production, replace with actual service integrations

    switch (notification_type) {
      case "JOB_APPROVAL_NEEDED":
        // Simulate sending approval notification to manager
        await simulateExternalServiceCall("approval_notification", {
          recipientRole: recipient_role,
          jobId: entity_id,
          payload,
        });
        break;

      case "JOB_APPROVED":
        // Simulate sending approval confirmation
        await simulateExternalServiceCall("job_approved_notification", {
          recipientUserId: recipient_user_id,
          jobId: entity_id,
          payload,
        });
        break;

      case "JOB_CLOSED":
        // Simulate sending job closure notification
        await simulateExternalServiceCall("job_closed_notification", {
          recipientUserId: recipient_user_id,
          jobId: entity_id,
          payload,
        });
        break;

      case "PRICING_SUBMITTED":
        // Simulate sending pricing submission notification
        await simulateExternalServiceCall("pricing_submitted_notification", {
          recipientRole: recipient_role,
          jobId: entity_id,
          payload,
        });
        break;

      case "SIGNATURE_UPLOADED":
        // Simulate sending signature upload notification
        await simulateExternalServiceCall("signature_uploaded_notification", {
          recipientUserId: recipient_user_id,
          jobId: entity_id,
          payload,
        });
        break;

      case "USER_LOGIN":
      case "USER_LOGOUT":
      case "TOKEN_REFRESH":
      case "USER_ACTIVITY":
        // Security/audit notifications - lower priority
        await simulateExternalServiceCall("security_notification", {
          notificationType: notification_type,
          recipientUserId: recipient_user_id,
          payload,
        });
        break;

      default:
        // Unknown notification type - log and succeed
        log("Unknown notification type processed", {
          notificationId,
          notificationType: notification_type,
        });
    }

    return true;
  } catch (error) {
    errorLog("Notification processing failed", error, {
      notificationId,
      notificationType: notification_type,
    });
    return false;
  }
};

/**
 * Simulates external service calls
 * In production, replace with actual API calls to:
 * - Email services
 * - SMS providers
 * - Webhook endpoints
 * - Message queues
 * - etc.
 *
 * @param {string} serviceType - Type of service being called
 * @param {Object} data - Data to send to the service
 */
const simulateExternalServiceCall = async (serviceType, data) => {
  // Simulate network delay and potential failures
  const delay = Math.random() * 1000 + 500; // 500-1500ms
  await new Promise(resolve => setTimeout(resolve, delay));

  // Simulate occasional failures (5% failure rate)
  if (Math.random() < 0.05) {
    throw new Error(`Simulated ${serviceType} service failure`);
  }

  // Simulate service-specific processing
  switch (serviceType) {
    case "approval_notification":
      log("Approval notification sent to manager", {
        serviceType,
        recipientRole: data.recipientRole,
        jobId: data.jobId,
      });
      break;

    case "job_approved_notification":
      log("Job approval confirmation sent", {
        serviceType,
        recipientUserId: data.recipientUserId,
        jobId: data.jobId,
      });
      break;

    case "job_closed_notification":
      log("Job closure notification sent", {
        serviceType,
        recipientUserId: data.recipientUserId,
        jobId: data.jobId,
      });
      break;

    case "pricing_submitted_notification":
      log("Pricing submission notification sent", {
        serviceType,
        recipientRole: data.recipientRole,
        jobId: data.jobId,
      });
      break;

    case "signature_uploaded_notification":
      log("Signature upload notification sent", {
        serviceType,
        recipientUserId: data.recipientUserId,
        jobId: data.jobId,
      });
      break;

    case "security_notification":
      log("Security notification sent", {
        serviceType,
        notificationType: data.notificationType,
        recipientUserId: data.recipientUserId,
      });
      break;

    default:
      log("Generic service call completed", { serviceType });
  }
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

    // Simulate the actual processing
    const success = await simulateNotificationProcessing(notification);

    if (success) {
      await markNotificationSent(notificationId);
      log("Notification processed successfully", { notificationId });
    } else {
      await markNotificationFailed(notificationId, "Processing simulation failed", maxRetries);
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