import JobStatusBadge from "@/components/JobStatusBadge";
import { parseJobData, type ApiJob } from "@/types/jobCard";
import { Clock } from "lucide-react";


export const MobileJobCard = ({ job, index, onApprove }: { job: ApiJob, index: number, onApprove?: (jobId: number | string) => void }) => (
    <div className="bg-white p-4 rounded-lg border border-slate-200/80 shadow-sm mb-3">
        <div className="flex justify-between items-start mb-2">
            <div>
                <div className="font-bold text-slate-800">{job.customer_name || "Unknown"}</div>
                <div className="text-xs text-slate-500">{job.job_card_no || `JOB-${1000 + index}`}</div>
            </div>
            <JobStatusBadge status={job.status} />
        </div>
        <div className="text-sm text-slate-600 mt-3 pt-3 border-t border-slate-100">
            <div className="flex items-center gap-2">
                <Clock size={14} className="text-slate-400" />
                <span>{job.job_date ? new Date(job.job_date).toLocaleDateString() : "N/A"}</span>
            </div>
            <div className="mt-2 text-xs text-slate-500">
                Assigned to: {job.engineer_name || "Unassigned"}
            </div>
            <div className="mt-1 text-xs text-slate-500">
                Manager: {job.manager_name || job.managerName || parseJobData(job.job_data).manager_name || "Unassigned"}
            </div>
        </div>
        {onApprove && (
            <div className="mt-3 pt-3 border-t border-slate-100 flex justify-end">
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onApprove(job.id);
                    }}
                    className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-sm shadow-emerald-500/20 active:scale-95 min-h-[44px]"
                >
                    Approve
                </button>
            </div>
        )}
    </div>
);