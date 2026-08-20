import type { ApiErrorDetail } from "@/types/jobCard";

/**
 * Turns whatever the API returned into one readable line.
 *
 * This existed twice — normalizeApiError in JobCardForm and normalizeAuthError in
 * Auth — both taking `unknown` and then reading `.error` and `.message` straight
 * off it, which is five of the project's type errors. The shapes are declared here
 * once instead, so the same narrowing serves both callers.
 *
 * The server is not consistent about the envelope: errorHandler sends
 * { error: { message, code, details } }, validate sends details as an array of
 * { path, message }, and a few paths send a bare { message }. All of them are
 * handled rather than assumed.
 */

export interface ApiErrorEnvelope {
  message?: string;
  error?:
    | string
    | {
        message?: string;
        code?: string;
        details?: string | ApiErrorDetail[];
      };
}

const fromDetails = (details: string | ApiErrorDetail[] | undefined): string | null => {
  if (typeof details === "string") return details;
  if (!Array.isArray(details) || details.length === 0) return null;

  const parts = details
    .map((detail) => {
      const field = detail?.field || detail?.path;
      const message = detail?.message;
      if (message && field) return `${field}: ${message}`;
      return message || field || null;
    })
    .filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join(", ") : null;
};

export function normalizeApiError(data: unknown, fallback = "Something went wrong"): string {
  if (typeof data === "string" && data.trim()) return data;
  if (!data || typeof data !== "object") return fallback;

  const body = data as ApiErrorEnvelope;
  const { error } = body;

  if (typeof error === "string" && error.trim()) return error;

  if (error && typeof error === "object") {
    if (typeof error.message === "string" && error.message.trim()) return error.message;

    const detailText = fromDetails(error.details);
    if (detailText) return detailText;

    if (typeof error.code === "string" && error.code.trim()) return error.code;
  }

  if (typeof body.message === "string" && body.message.trim()) return body.message;

  return fallback;
}
