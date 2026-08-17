/**
 * Email delivery.
 *
 * Inert until SMTP_HOST is configured: sendEmail then reports { skipped: true }
 * rather than throwing, so an unconfigured deployment queues and records
 * notifications exactly as before instead of failing them.
 */

import nodemailer from "nodemailer";
import logger from "../logger/logger.js";

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
const SMTP_SECURE = String(process.env.SMTP_SECURE ?? "").toLowerCase() === "true";
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASSWORD = process.env.SMTP_PASSWORD;
const SMTP_FROM = process.env.SMTP_FROM || "Job Card Agent <no-reply@localhost>";

let transporter = null;

export const isConfigured = () => Boolean(SMTP_HOST);

const getTransporter = () => {
  if (!isConfigured()) return null;
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASSWORD } : undefined,
  });

  logger.info("SMTP transport created", {
    eventType: "email",
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    authenticated: Boolean(SMTP_USER),
  });

  return transporter;
};

/**
 * Send one email.
 *
 * @param {{ to: string|string[], subject: string, text: string, html?: string }} message
 * @returns {Promise<{ sent: boolean, skipped?: boolean, messageId?: string, error?: string }>}
 */
export const sendEmail = async ({ to, subject, text, html }) => {
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);

  if (!recipients.length) {
    return { sent: false, error: "No recipients" };
  }

  const mailer = getTransporter();
  if (!mailer) {
    logger.debug("Email not sent: SMTP is not configured", {
      eventType: "email",
      subject,
      recipientCount: recipients.length,
    });
    return { sent: false, skipped: true };
  }

  try {
    const info = await mailer.sendMail({
      from: SMTP_FROM,
      to: recipients.join(", "),
      subject,
      text,
      html,
    });

    logger.info("Email sent", {
      eventType: "email",
      subject,
      recipientCount: recipients.length,
      messageId: info.messageId,
    });

    return { sent: true, messageId: info.messageId };
  } catch (error) {
    logger.error("Email delivery failed", {
      eventType: "email",
      subject,
      recipientCount: recipients.length,
      error: error.message,
    });
    // Surfaced to the caller so the notification queue can retry it.
    return { sent: false, error: error.message };
  }
};

/** Reset the cached transport. Used by tests. */
export const resetTransport = () => {
  transporter = null;
};

export default { isConfigured, sendEmail, resetTransport };
