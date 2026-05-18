import pool from "../db.js";
import logger from "./logger/logger.js";

const EVENT_TYPES = {
  JOB_CREATED: "JOB_CREATED",
  JOB_APPROVED: "JOB_APPROVED",
  JOB_CLOSED: "JOB_CLOSED",
  PRICING_SUBMITTED: "PRICING_SUBMITTED",
  SIGNATURE_UPLOADED: "SIGNATURE_UPLOADED",
  USER_LOGIN: "USER_LOGIN",
  TOKEN_REFRESH: "TOKEN_REFRESH",
  USER_LOGOUT: "USER_LOGOUT",
};

const NOTIFICATION_TYPES = {
  JOB_APPROVAL_NEEDED: "JOB_APPROVAL_NEEDED",
  JOB_APPROVED: "JOB_APPROVED",
  JOB_CLOSED: "JOB_CLOSED",
  PRICING_SUBMITTED: "PRICING_SUBMITTED",
  SIGNATURE_UPLOADED: "SIGNATURE_UPLOADED",
  USER_LOGIN: "USER_LOGIN",
  TOKEN_REFRESH: "TOKEN_REFRESH",
  USER_LOGOUT: "USER_LOGOUT",
  USER_ACTIVITY: "USER_ACTIVITY",
};

const log = (message) => {
  logger.debug(message, { eventType: "event" });
};

const queueLog = (message) => {
  logger.debug(message, { eventType: "queue" });
};

export const emitEvent = async ({
  eventType,
  entityType,
  entityId,
  payload,
  createdBy,
  client = null,
}) => {
  try {
    const query = `
      INSERT INTO system_events
        (event_type, entity_type, entity_id, payload, created_by)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *`;
    const result = client
      ? await client.query(query, [eventType, entityType, entityId, payload, createdBy])
      : await pool.query(query, [eventType, entityType, entityId, payload, createdBy]);

    log(`${eventType} emitted for ${entityType}:${entityId}`);
    return result.rows[0];
  } catch (err) {
    logger.error("Failed to emit event", {
      eventType: "event",
      error: err.message,
      eventType: eventType,
      entityType,
      entityId,
    });
    // Don't throw - events should not break business logic
    return null;
  }
};

export const queueNotification = async ({
  eventId,
  notificationType,
  recipientRole = null,
  recipientUserId = null,
  client = null,
}) => {
  try {
    const query = `
      INSERT INTO notification_queue
        (event_id, notification_type, recipient_role, recipient_user_id)
      VALUES ($1, $2, $3, $4)
      RETURNING *`;
    const result = client
      ? await client.query(query, [eventId, notificationType, recipientRole, recipientUserId])
      : await pool.query(query, [eventId, notificationType, recipientRole, recipientUserId]);

    queueLog(`Notification queued: ${notificationType} for ${recipientRole || recipientUserId}`);
    return result.rows[0];
  } catch (err) {
    logger.error("Failed to queue notification", {
      eventType: "queue",
      error: err.message,
      notificationType,
      recipientRole,
      recipientUserId,
    });
    return null;
  }
};

export const getPendingNotifications = async (limit = 100) => {
  try {
    const query = `
      SELECT nq.*, se.event_type, se.entity_type, se.entity_id, se.payload
      FROM notification_queue nq
      JOIN system_events se ON nq.event_id = se.id
      WHERE nq.status = 'PENDING'
      ORDER BY nq.created_at ASC
      LIMIT $1`;
    const result = await pool.query(query, [limit]);

    queueLog(`Fetched ${result.rows.length} pending notifications`);
    return result.rows;
  } catch (err) {
    logger.error("Failed to fetch pending notifications", {
      eventType: "queue",
      error: err.message,
      limit,
    });
    return [];
  }
};

export const markNotificationProcessed = async (notificationId, status, errorMessage = null) => {
  try {
    const query = `
      UPDATE notification_queue
      SET status = $1, processed_at = CURRENT_TIMESTAMP, error_message = $2
      WHERE id = $3`;
    await pool.query(query, [status, errorMessage, notificationId]);
  } catch (err) {
    logger.error("Failed to mark notification processed", {
      eventType: "queue",
      error: err.message,
      notificationId,
      status,
    });
  }
};

export { EVENT_TYPES, NOTIFICATION_TYPES };

export default {
  emitEvent,
  queueNotification,
  getPendingNotifications,
  markNotificationProcessed,
  EVENT_TYPES,
  NOTIFICATION_TYPES,
};
