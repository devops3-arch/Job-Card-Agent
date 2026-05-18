import { Badge } from "@/components/ui/badge";
import { Clock } from "lucide-react";

const getStatusBadge = (status: string) => {
    const s = status ? status.toLowerCase() : "";
    if (s.includes('submit')) {
        return <Badge className="bg-blue-50/80 text-blue-700 border border-blue-200/60 rounded-full px-3 py-0.5 text-xs font-semibold shadow-sm">Submitted</Badge>;
    } else if (s.includes('approve')) {
        return <Badge className="bg-emerald-50/80 text-emerald-700 border border-emerald-200/60 rounded-full px-3 py-0.5 text-xs font-semibold shadow-sm">Approved</Badge>;
    } else if (s.includes('review') || s.includes('reject') || s.includes('pend')) {
        return <Badge className="bg-amber-50/80 text-amber-700 border border-amber-200/60 rounded-full px-3 py-0.5 text-xs font-semibold shadow-sm">Under Review</Badge>;
    }
    return <Badge variant="outline" className="rounded-full shadow-sm">{status || "New"}</Badge>;
};

export const MobileJobCard = ({ job, index, onApprove }: { job: any, index: number, onApprove?: (jobId: string) => void }) => (
    <div className="bg-white p-4 rounded-lg border border-slate-200/80 shadow-sm mb-3">
        <div className="flex justify-between items-start mb-2">
            <div>
                <div className="font-bold text-slate-800">{job.customer_name || "Unknown"}</div>
                <div className="text-xs text-slate-500">{job.job_card_no || `JOB-${1000 + index}`}</div>
            </div>
            {getStatusBadge(job.status)}
        </div>
        <div className="text-sm text-slate-600 mt-3 pt-3 border-t border-slate-100">
            <div className="flex items-center gap-2">
                <Clock size={14} className="text-slate-400" />
                <span>{job.job_date ? new Date(job.job_date).toLocaleDateString() : "N/A"}</span>
            </div>
            <div className="mt-2 text-xs text-slate-500">
                Assigned to: {job.engineer_name || "Unassigned"}
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