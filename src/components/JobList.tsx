import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, CheckCircle2, XCircle, Edit, ExternalLink } from "lucide-react";
import { Badge } from "./ui/badge";
import JobCardForm from "./jobcard/JobCardForm";

const getStatusBadge = (status: string) => {
    const s = status ? status.toLowerCase() : "";
    if (s.includes("approve"))
        return <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-3 py-0.5 text-xs font-semibold">Approved</Badge>;
    if (s.includes("reject"))
        return <Badge className="bg-red-50 text-red-700 border border-red-200 rounded-full px-3 py-0.5 text-xs font-semibold">Rejected</Badge>;
    return <Badge className="bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-3 py-0.5 text-xs font-semibold">Pending</Badge>;
};

const JobList = () => {
    const [jobs, setJobs] = useState<any[]>([]);
    const [viewJobId, setViewJobId] = useState<number | null>(null);

    const fetchJobs = async () => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);
            const res = await apiFetch("/jobs?ts=" + new Date().getTime(), { signal: controller.signal });
            clearTimeout(timeoutId);
            if (!res.ok) throw new Error("Backend connection failed");
            const data = await res.json();
            setJobs(Array.isArray(data.data) ? data.data : []);
        } catch {
            const localJobs = JSON.parse(localStorage.getItem("mockJobs") || "[]");
            setJobs(localJobs);
        }
    };

    const updateStatus = async (id: number, status: string) => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);
            const res = await apiFetch(`/jobs/${id}/status`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status }),
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            if (!res.ok) throw new Error("Backend connection failed");
            fetchJobs();
        } catch {
            const localJobs = JSON.parse(localStorage.getItem("mockJobs") || "[]");
            const updated = localJobs.map((j: any) => String(j.id) === String(id) ? { ...j, status } : j);
            localStorage.setItem("mockJobs", JSON.stringify(updated));
            fetchJobs();
            window.dispatchEvent(new Event("jobsUpdated"));
        }
    };

    useEffect(() => {
        fetchJobs();
        const interval = setInterval(fetchJobs, 5000);
        const listener = () => fetchJobs();
        window.addEventListener("jobsUpdated", listener);
        return () => { clearInterval(interval); window.removeEventListener("jobsUpdated", listener); };
    }, []);

    if (!Array.isArray(jobs)) return <p className="p-4 text-slate-500">Loading…</p>;

    if (viewJobId) {
        return (
            <div className="p-4">
                <button
                    onClick={() => setViewJobId(null)}
                    className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-800 bg-white border border-slate-200 px-4 py-2.5 rounded-lg shadow-sm transition-colors min-h-[44px]"
                >
                    <ArrowLeft size={16} /> Back to Job List
                </button>
                <JobCardForm role="manager" jobId={viewJobId} />
            </div>
        );
    }

    return (
        <div className="p-4 sm:p-6">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-800 mb-4 sm:mb-6">Saved Jobs</h2>

            {jobs.length === 0 ? (
                <p className="text-slate-500 text-sm">No jobs found.</p>
            ) : (
                <>
                    {/* Mobile card list — shown below md */}
                    <div className="md:hidden space-y-3">
                        <AnimatePresence>
                            {jobs.map((job, idx) => (
                                <motion.div
                                    key={job.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: idx * 0.04 }}
                                    className="bg-white rounded-xl border border-slate-200 shadow-sm p-4"
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <div>
                                            <p className="font-bold text-slate-800 text-sm">{job.customer_name || "—"}</p>
                                            <p className="text-xs text-slate-500">{job.job_card_no || `#${job.id}`}</p>
                                        </div>
                                        {getStatusBadge(job.status)}
                                    </div>

                                    <div className="grid grid-cols-2 gap-1 text-xs text-slate-500 mb-3">
                                        <span>Date: {job.job_date || "—"}</span>
                                        <span>Area: {job.sales_area || "—"}</span>
                                        <span>Type: {job.service_type || "—"}</span>
                                        <span className="font-semibold text-slate-700">
                                            {job.grand_total ? `AED ${job.grand_total}` : "N/A"}
                                        </span>
                                    </div>

                                    <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-100">
                                        <button
                                            onClick={() => setViewJobId(job.id)}
                                            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors min-h-[36px]"
                                        >
                                            <Edit size={13} /> Edit
                                        </button>

                                        {job.status !== "APPROVED" && (
                                            <>
                                                <button
                                                    onClick={() => updateStatus(job.id, "APPROVED")}
                                                    className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors min-h-[36px]"
                                                >
                                                    <CheckCircle2 size={13} /> Approve
                                                </button>
                                                <button
                                                    onClick={() => updateStatus(job.id, "REJECTED")}
                                                    className="flex items-center gap-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors min-h-[36px]"
                                                >
                                                    <XCircle size={13} /> Reject
                                                </button>
                                            </>
                                        )}

                                        {job.status?.toUpperCase() === "APPROVED" && (
                                            <button
                                                onClick={() => setViewJobId(job.id)}
                                                className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors min-h-[36px]"
                                            >
                                                <ExternalLink size={13} /> Export
                                            </button>
                                        )}
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>

                    {/* Desktop table — hidden below md */}
                    <div className="hidden md:block bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider font-semibold border-b border-slate-200">
                                    <tr>
                                        <th className="px-5 py-3.5">ID</th>
                                        <th className="px-5 py-3.5">Job Card No</th>
                                        <th className="px-5 py-3.5">Customer</th>
                                        <th className="px-5 py-3.5">Date</th>
                                        <th className="px-5 py-3.5">Status</th>
                                        <th className="px-5 py-3.5">Total</th>
                                        <th className="px-5 py-3.5 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    <AnimatePresence>
                                        {jobs.map((job, idx) => (
                                            <motion.tr
                                                key={job.id}
                                                initial={{ opacity: 0, x: -10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: idx * 0.03 }}
                                                className="hover:bg-slate-50 transition-colors"
                                            >
                                                <td className="px-5 py-3.5 text-slate-600">{job.id}</td>
                                                <td className="px-5 py-3.5 font-semibold text-slate-800">{job.job_card_no || "—"}</td>
                                                <td className="px-5 py-3.5 text-slate-700">{job.customer_name}</td>
                                                <td className="px-5 py-3.5 text-slate-500">{job.job_date || "—"}</td>
                                                <td className="px-5 py-3.5">{getStatusBadge(job.status)}</td>
                                                <td className="px-5 py-3.5 font-semibold text-slate-800">
                                                    {job.grand_total ? `AED ${job.grand_total}` : "N/A"}
                                                </td>
                                                <td className="px-5 py-3.5">
                                                    <div className="flex justify-end flex-wrap gap-1.5">
                                                        <button
                                                            onClick={() => setViewJobId(job.id)}
                                                            className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                                                        >
                                                            Edit
                                                        </button>
                                                        {job.status !== "APPROVED" && (
                                                            <>
                                                                <button
                                                                    onClick={() => updateStatus(job.id, "APPROVED")}
                                                                    className="bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                                                                >
                                                                    Approve
                                                                </button>
                                                                <button
                                                                    onClick={() => updateStatus(job.id, "REJECTED")}
                                                                    className="bg-red-500 hover:bg-red-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                                                                >
                                                                    Reject
                                                                </button>
                                                            </>
                                                        )}
                                                        {job.status?.toUpperCase() === "APPROVED" && (
                                                            <button
                                                                onClick={() => setViewJobId(job.id)}
                                                                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                                                            >
                                                                Export
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </motion.tr>
                                        ))}
                                    </AnimatePresence>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default JobList;
