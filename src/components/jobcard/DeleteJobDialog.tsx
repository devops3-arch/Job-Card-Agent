import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api";
import type { ApiJob, ApiErrorDetail } from "@/types/jobCard";

/**
 * Confirms and performs a job card deletion.
 *
 * The delete is a soft delete on the server: DELETE /jobs/:id sets the status to
 * DELETED and records deleted_at, deleted_by and delete_reason, then writes an
 * audit entry. The reason is mandatory — deleteJobSchema requires between 1 and
 * 500 characters — so this dialog collects it rather than sending the request
 * without one. The previous handler in DashboardContent sent no body at all and
 * would have been rejected with a 400.
 *
 * Only managers and admins may delete; the endpoint enforces that with
 * requireRole, and the caller hides the trigger for engineers.
 */

const MAX_REASON = 500;

type Props = {
  job: ApiJob | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after the server confirms the deletion, so the list can refresh. */
  onDeleted: (jobId: number) => void;
};

const errorMessage = (body: unknown): string => {
  const payload = body as { error?: { message?: string; details?: ApiErrorDetail[] } } | undefined;
  const detail = payload?.error?.details?.[0];
  return detail?.message || payload?.error?.message || "Could not delete this job card.";
};

const DeleteJobDialog = ({ job, open, onOpenChange, onDeleted }: Props) => {
  const [reason, setReason] = useState("");
  const [deleting, setDeleting] = useState(false);

  const label = job?.job_card_no || (job?.id != null ? `#${job.id}` : "this job card");
  const trimmedReason = reason.trim();
  const canDelete = trimmedReason.length > 0 && !deleting;

  const close = (next: boolean) => {
    if (deleting) return;
    if (!next) setReason("");
    onOpenChange(next);
  };

  const handleDelete = async () => {
    if (!job?.id || !canDelete) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/jobs/${job.id}`, {
        method: "DELETE",
        body: JSON.stringify({ delete_reason: trimmedReason }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(errorMessage(body));
        return;
      }

      toast.success(`Job card ${label} deleted`);
      setReason("");
      onOpenChange(false);
      onDeleted(Number(job.id));
    } catch {
      // A network failure must not look like a success — the old handler swallowed
      // the error and removed the row from the list regardless.
      toast.error("Could not reach the server. The job card was not deleted.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={close}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete job card {label}?</AlertDialogTitle>
          <AlertDialogDescription>
            {job?.customer_name ? `${job.customer_name} · ` : ""}
            This marks the job card as deleted and records who did it and why. It stops
            appearing in the job list. A reason is required.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2">
          <label htmlFor="delete-reason" className="text-sm font-medium text-foreground">
            Reason for deletion
          </label>
          <Textarea
            id="delete-reason"
            value={reason}
            maxLength={MAX_REASON}
            disabled={deleting}
            onChange={(event) => setReason(event.target.value)}
            placeholder="e.g. Raised against the wrong customer"
          />
          <p className="text-xs text-muted-foreground">
            {trimmedReason.length === 0
              ? "Required."
              : `${trimmedReason.length} of ${MAX_REASON} characters.`}
          </p>
        </div>

        <AlertDialogFooter>
          {/* Plain buttons rather than AlertDialogAction/Cancel: those close the
              dialog on click, which would dismiss it before the request finishes
              and lose the error message when one comes back. */}
          <button
            type="button"
            onClick={() => close(false)}
            disabled={deleting}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-secondary disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={!canDelete}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-destructive px-4 text-sm font-semibold text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
            {deleting ? "Deleting…" : "Delete job card"}
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DeleteJobDialog;
