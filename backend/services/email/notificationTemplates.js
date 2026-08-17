/**
 * Which notifications become emails, and what they say.
 *
 * Deliberately free of database and transport dependencies so the routing rules
 * can be tested on their own. Only job lifecycle events are emailed — login and
 * token-refresh events stay in the audit log, because an email per login is noise
 * rather than information.
 */

const APP_URL = () => process.env.FRONTEND_URL || "http://localhost:8080";

export const EMAILABLE = {
  JOB_APPROVAL_NEEDED: {
    subject: (job) => `Job card ${job.reference} needs your approval`,
    body: (job) =>
      `A job card is waiting for pricing and approval.\n\n${job.summary}\n\nOpen it here: ${APP_URL()}\n`,
  },
  PRICING_SUBMITTED: {
    subject: (job) => `Pricing submitted for job card ${job.reference}`,
    body: (job) =>
      `Pricing has been submitted and is ready for review.\n\n${job.summary}\n\nOpen it here: ${APP_URL()}\n`,
  },
  JOB_APPROVED: {
    subject: (job) => `Job card ${job.reference} approved`,
    body: (job) => `Your job card has been approved.\n\n${job.summary}\n\nOpen it here: ${APP_URL()}\n`,
  },
  JOB_CLOSED: {
    subject: (job) => `Job card ${job.reference} closed`,
    body: (job) => `Your job card has been closed.\n\n${job.summary}\n\nOpen it here: ${APP_URL()}\n`,
  },
};

export const isEmailable = (notificationType) => Boolean(EMAILABLE[notificationType]);

export const getTemplate = (notificationType) => EMAILABLE[notificationType] ?? null;

export default { EMAILABLE, isEmailable, getTemplate };
