import { Badge } from "@/components/ui/badge";
import {
  JOB_STATUSES,
  formatStatus,
  normalizeStatus,
} from "@/lib/jobStatus";

/**
 * The status pill, in one place.
 *
 * There were three copies of this — in DashboardContent, ManagerPortal and
 * MobileJobCard — each matching on substrings in a slightly different order. That
 * is fragile in a specific way: PENDING_APPROVAL and APPROVED both contain
 * "APPROV", so whether a pending job showed as pending or as approved came down
 * to which branch happened to be written first. One of the three also fell
 * through to printing the raw enum for any status it did not recognise.
 *
 * Colour and label are both derived from the normalised status, so legacy values
 * such as WAITING_APPROVAL land on the same pill as the current name.
 */

const TONES: Record<string, string> = {
  [JOB_STATUSES.DRAFT]: "bg-slate-100 text-slate-600 border-slate-200",
  [JOB_STATUSES.SUBMITTED]: "bg-blue-50/80 text-blue-700 border-blue-200/60",
  [JOB_STATUSES.PENDING_APPROVAL]: "bg-amber-50/80 text-amber-700 border-amber-200/60",
  [JOB_STATUSES.APPROVED]: "bg-emerald-50/80 text-emerald-700 border-emerald-200/60",
  [JOB_STATUSES.REJECTED]: "bg-red-50/80 text-red-700 border-red-200/60",
  [JOB_STATUSES.DELETED]: "bg-slate-100 text-slate-500 border-slate-200",
  [JOB_STATUSES.COMPLETED]: "bg-slate-100 text-slate-600 border-slate-200",
};

const FALLBACK_TONE = "bg-slate-100 text-slate-600 border-slate-200";

type Props = {
  status?: string | null;
  className?: string;
};

const JobStatusBadge = ({ status, className = "" }: Props) => {
  const tone = TONES[normalizeStatus(status)] ?? FALLBACK_TONE;

  return (
    <Badge
      className={`${tone} border rounded-full px-3 py-0.5 text-xs font-semibold shadow-sm ${className}`.trim()}
    >
      {formatStatus(status)}
    </Badge>
  );
};

export default JobStatusBadge;
