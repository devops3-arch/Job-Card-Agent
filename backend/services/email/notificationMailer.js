/**
 * Turns a queued notification into an email.
 *
 * Recipients come from the queue row: recipient_user_id addresses one person,
 * recipient_role addresses every active user holding that role. Only the job
 * lifecycle notifications are emailed — login and token-refresh events stay in
 * the audit log, since an email per login is noise, not information.
 */

import pool from "../../db.js";
import logger from "../logger/logger.js";
import { sendEmail, isConfigured } from "./emailService.js";
import { getTemplate, isEmailable } from "./notificationTemplates.js";


const resolveRecipients = async ({ recipientUserId, recipientRole }) => {
  if (recipientUserId) {
    const result = await pool.query(
      "SELECT email FROM users WHERE id = $1 AND is_active IS NOT FALSE",
      [recipientUserId]
    );
    return result.rows.map((row) => row.email).filter(Boolean);
  }

  if (recipientRole) {
    const result = await pool.query(
      "SELECT email FROM users WHERE role = $1 AND is_active IS NOT FALSE",
      [recipientRole]
    );
    return result.rows.map((row) => row.email).filter(Boolean);
  }

  return [];
};

// Job details for the email body, read from the event payload where possible and
// topped up from job_master so the subject line carries a human reference.
const describeJob = async (entityId, payload) => {
  const fromPayload = {
    job_card_no: payload?.job_card_no,
    customer_name: payload?.customer_name,
    status: payload?.status,
  };

  let job = fromPayload;
  if (entityId && (!job.job_card_no || !job.customer_name)) {
    try {
      const result = await pool.query(
        "SELECT job_card_no, customer_name, status, sales_area FROM job_master WHERE id = $1",
        [entityId]
      );
      if (result.rows.length) job = { ...result.rows[0], ...stripEmpty(fromPayload) };
    } catch (error) {
      logger.debug("Could not read job for notification email", {
        eventType: "email",
        jobId: entityId,
        error: error.message,
      });
    }
  }

  const reference = job.job_card_no || (entityId ? `#${entityId}` : "(unknown)");
  const lines = [
    `Job card:  ${reference}`,
    job.customer_name ? `Customer:  ${job.customer_name}` : null,
    job.sales_area ? `Area:      ${job.sales_area}` : null,
    job.status ? `Status:    ${job.status}` : null,
  ].filter(Boolean);

  return { reference, summary: lines.join("\n") };
};

const stripEmpty = (obj) =>
  Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined && value !== null && value !== ""));

/**
 * Deliver a queued notification by email.
 *
 * @returns {Promise<{ sent: boolean, skipped?: boolean, error?: string, recipients?: number }>}
 */
export const deliverNotificationEmail = async (notification) => {
  const template = getTemplate(notification.notification_type);
  if (!template) return { sent: false, skipped: true };

  if (!isConfigured()) {
    logger.debug("Notification email skipped: SMTP not configured", {
      eventType: "email",
      notificationType: notification.notification_type,
    });
    return { sent: false, skipped: true };
  }

  const recipients = await resolveRecipients({
    recipientUserId: notification.recipient_user_id,
    recipientRole: notification.recipient_role,
  });

  if (!recipients.length) {
    logger.warn("Notification has no deliverable recipients", {
      eventType: "email",
      notificationType: notification.notification_type,
      recipientRole: notification.recipient_role,
      recipientUserId: notification.recipient_user_id,
    });
    return { sent: false, skipped: true, recipients: 0 };
  }

  const job = await describeJob(notification.entity_id, notification.payload);
  const result = await sendEmail({
    to: recipients,
    subject: template.subject(job),
    text: template.body(job),
  });

  return { ...result, recipients: recipients.length };
};

export { isEmailable };
export default { deliverNotificationEmail, isEmailable };
