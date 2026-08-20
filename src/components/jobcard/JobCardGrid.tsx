import { useMemo, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import type { ApiJob } from "@/types/jobCard";
import {
  JOB_STATUSES,
  isApproved,
  isAwaitingApproval,
  isRejected,
  isSubmitted,
  normalizeStatus,
} from "@/lib/jobStatus";

/**
 * The job card list as a filterable specification grid.
 *
 * Deliberately flat: square corners, hairline shared borders, no shadows, and
 * monospace for every small label. The cards sit in one continuous grid rather
 * than floating apart — each cell draws its right and bottom edge and the wrapper
 * draws the top and left, so neighbours share a single 1px line.
 */

type Filter = {
  id: string;
  label: string;
  matches: (job: ApiJob) => boolean;
};

const FILTERS: Filter[] = [
  { id: "all", label: "All", matches: () => true },
  { id: "pending", label: "Pending Approval", matches: (j) => isAwaitingApproval(j.status) },
  { id: "submitted", label: "Submitted", matches: (j) => isSubmitted(j.status) },
  { id: "approved", label: "Approved", matches: (j) => isApproved(j.status) },
  { id: "rejected", label: "Rejected", matches: (j) => isRejected(j.status) },
  {
    id: "draft",
    label: "Draft",
    matches: (j) => normalizeStatus(j.status) === JOB_STATUSES.DRAFT,
  },
];

const STATUS_LABELS: Record<string, string> = {
  [JOB_STATUSES.DRAFT]: "Draft",
  [JOB_STATUSES.SUBMITTED]: "Submitted",
  [JOB_STATUSES.PENDING_APPROVAL]: "Pending Approval",
  [JOB_STATUSES.APPROVED]: "Approved",
  [JOB_STATUSES.REJECTED]: "Rejected",
  [JOB_STATUSES.COMPLETED]: "Completed",
};

const statusLabel = (status?: string | null) => {
  const normalised = normalizeStatus(status);
  return STATUS_LABELS[normalised] ?? normalised.replace(/_/g, " ");
};

/** Rejections are the one thing worth colouring; everything else stays ink. */
const statusTone = (status?: string | null) =>
  isRejected(status) ? "text-[#b3401b]" : "text-neutral-500";

const SERVICE_TYPE_LABELS: Record<string, string> = {
  service_contract: "Service Contract",
  warranty: "Warranty / AMC",
  customer_request: "Customer Request",
  breakdown_call: "Breakdown Call",
};

/** Keeps the money formatting the table used, rather than reinterpreting it here. */
const formatTotal = (total: ApiJob["grand_total"]) => {
  if (total === null || total === undefined || total === "") return "—";
  return typeof total === "number" ? `₹${total.toFixed(2)}` : String(total);
};

const dash = (value?: string | null) => {
  const text = String(value ?? "").trim();
  return text || "—";
};

type Props = {
  jobs: ApiJob[];
  onOpen: (job: ApiJob) => void;
  getEngineerName: (job: ApiJob) => string;
  getManagerName: (job: ApiJob) => string;
  /** Label for the action in each card's footer; managers review, engineers edit. */
  actionLabel?: string;
};

const JobCardGrid = ({
  jobs,
  onOpen,
  getEngineerName,
  getManagerName,
  actionLabel = "Open job card",
}: Props) => {
  const [active, setActive] = useState("all");

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.id, jobs.filter(f.matches).length])),
    [jobs],
  );

  const activeFilter = FILTERS.find((f) => f.id === active) ?? FILTERS[0];
  const shown = useMemo(() => jobs.filter(activeFilter.matches), [jobs, activeFilter]);

  // Empty filters are hidden, except All, so the row does not fill with zeroes.
  const visibleFilters = FILTERS.filter((f) => f.id === "all" || counts[f.id] > 0);

  return (
    <section className="mt-8 bg-[#f4f3f1] p-6 sm:p-8 border border-[#e3e1dd]">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-extrabold tracking-tight text-[#17181a]">
            Job Cards
          </h2>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-neutral-500">
            Engineered records, filed to spec
          </p>
        </div>
      </header>

      {/* Filter tabs. The active one inverts and takes an accent rule on top. */}
      <div className="mt-6 flex flex-wrap gap-2">
        {visibleFilters.map((filter) => {
          const isActive = filter.id === active;
          return (
            <button
              key={filter.id}
              type="button"
              onClick={() => setActive(filter.id)}
              aria-pressed={isActive}
              className={[
                "relative border px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors",
                isActive
                  ? "border-[#111111] bg-[#111111] text-white"
                  : "border-[#d9d6d1] bg-white text-neutral-700 hover:border-[#111111]",
              ].join(" ")}
            >
              {isActive && <span className="absolute inset-x-0 -top-px h-[3px] bg-[#c2410c]" />}
              {filter.label}
              <span className={isActive ? "ml-2 text-neutral-400" : "ml-2 text-neutral-400"}>
                {counts[filter.id]}
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.14em] text-neutral-500">
        {shown.length} {shown.length === 1 ? "job card" : "job cards"}
        {active === "all" ? " across all statuses" : ` · ${activeFilter.label}`}
      </p>

      {shown.length === 0 ? (
        <div className="mt-4 border border-[#e3e1dd] bg-white px-6 py-16 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-neutral-500">
            No job cards in this range
          </p>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 border-l border-t border-[#e3e1dd] md:grid-cols-2 xl:grid-cols-3">
          {shown.map((job) => {
            const specs: Array<[string, string]> = [
              ["Job #", dash(job.job_card_no ? String(job.job_card_no) : String(job.id))],
              ["Technician", dash(getEngineerName(job))],
              ["Manager", dash(getManagerName(job))],
              ["Date", dash(job.job_date)],
              ["Total", formatTotal(job.grand_total)],
            ];

            const tags = [
              SERVICE_TYPE_LABELS[String(job.service_type ?? "")] ?? job.service_type,
              job.sales_area,
              job.under_warranty ? "Under warranty" : null,
            ].filter((tag): tag is string => Boolean(tag));

            return (
              <article
                key={job.id}
                onClick={() => onOpen(job)}
                className="group flex cursor-pointer flex-col border-b border-r border-[#e3e1dd] bg-white p-6 transition-colors hover:bg-[#faf9f7]"
              >
                <p
                  className={`font-mono text-[11px] uppercase tracking-[0.14em] ${statusTone(job.status)}`}
                >
                  {statusLabel(job.status)}
                </p>

                <h3 className="mt-4 font-display text-lg font-bold leading-snug tracking-tight text-[#17181a]">
                  {dash(job.customer_name)}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                  {dash(job.equipment_name)}
                  {job.equipment_model ? ` · ${job.equipment_model}` : ""}
                </p>

                {/* Specification rows: label left, value right, hairline between. */}
                <dl className="mt-5">
                  {specs.map(([label, value]) => (
                    <div
                      key={label}
                      className="flex items-baseline justify-between gap-3 border-t border-[#ebe9e5] py-2.5 first:border-t-0"
                    >
                      <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-500">
                        {label}
                      </dt>
                      <dd className="truncate font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-[#17181a]">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>

                {tags.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="border border-[#d9d6d1] px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-neutral-600"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-6 flex justify-end border-t border-[#ebe9e5] pt-4">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpen(job);
                    }}
                    className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-[#17181a] transition-colors group-hover:text-[#c2410c]"
                  >
                    {actionLabel}
                    <ArrowUpRight size={13} strokeWidth={2.5} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default JobCardGrid;
