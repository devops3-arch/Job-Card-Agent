import { useEffect, useState } from "react";
import type { ApiJob } from "@/types/jobCard";
import { apiFetch } from "@/lib/api";
import { isApproved, isAwaitingApproval, isSubmitted } from "@/lib/jobStatus";
import { CheckCircle2, Clock, FileText, Download, FileSpreadsheet, Trash2 } from "lucide-react";
import { Badge } from "./ui/badge";
import JobCardForm from "./jobcard/JobCardForm";
import DeleteJobDialog from "./jobcard/DeleteJobDialog";
import PricingPanel from "./PricingPanel";
import { generateGlobalPDF } from "@/utils/exportPdf";
import * as XLSX from "xlsx-js-style";
import { motion, AnimatePresence } from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileJobCard } from "./MobileJobCard";

const getStatusBadge = (status: string) => {
    const s = (status ?? "").toUpperCase();
    if (!s || s === "DRAFT")
        return <Badge className="bg-slate-100 text-slate-600 border border-slate-200 rounded-full px-3 py-0.5 text-xs font-semibold shadow-sm">Draft</Badge>;
    if (s === "WAITING_PRICING" || s === "PENDING_APPROVAL" || s.includes("SUBMIT") || s.includes("REVIEW") || s.includes("PEND"))
        return <Badge className="bg-amber-50/80 text-amber-700 border border-amber-200/60 rounded-full px-3 py-0.5 text-xs font-semibold shadow-sm">Pending Approval</Badge>;
    if (s === "APPROVED" || s.includes("APPROV"))
        return <Badge className="bg-emerald-50/80 text-emerald-700 border border-emerald-200/60 rounded-full px-3 py-0.5 text-xs font-semibold shadow-sm">Approved</Badge>;
    if (s === "REJECTED" || s.includes("REJECT"))
        return <Badge className="bg-red-50/80 text-red-700 border border-red-200/60 rounded-full px-3 py-0.5 text-xs font-semibold shadow-sm">Rejected</Badge>;
    if (s === "CLOSED")
        return <Badge className="bg-slate-100 text-slate-600 border border-slate-200 rounded-full px-3 py-0.5 text-xs font-semibold shadow-sm">Closed</Badge>;
    return <Badge variant="outline" className="rounded-full shadow-sm">{status}</Badge>;
};

const STAT_ANIMATION = {
    hidden: { opacity: 0, y: 20 },
    visible: (i: number) => ({
        opacity: 1, y: 0,
        transition: { delay: i * 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }
    })
};

const DashboardContent = () => {
    const [jobs, setJobs] = useState<ApiJob[]>([]);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [selectedJob, setSelectedJob] = useState<ApiJob | null>(null);
    const [jobPendingDelete, setJobPendingDelete] = useState<ApiJob | null>(null);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const isMobile = useIsMobile();
    const user = (() => { try { return JSON.parse(localStorage.getItem("user") || "{}"); } catch { return {}; } })();
    const userRole = user?.role || '';
    const userId = user?.id;
    const userName = user?.name || user?.fullName || "";

    const getManagerName = (job: ApiJob) => job.manager_name || job.managerName || job.job_data?.manager_name || "—";
    const getEngineerName = (job: ApiJob) => job.engineer_name || job.engineerName || job.job_data?.engineer_name || "—";

    useEffect(() => {
        const fetchJobs = () => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);
            apiFetch("/jobs?ts=" + new Date().getTime(), { signal: controller.signal })
                .then(res => {
                    clearTimeout(timeoutId);
                    if (!res.ok) throw new Error("Backend connection failed");
                    return res.json();
                })
                .then(data => {
                    setJobs(Array.isArray(data.data) ? data.data : []);
                })
                .catch(() => {
                    const localJobs = JSON.parse(localStorage.getItem('mockJobs') || '[]');
                    setJobs(Array.isArray(localJobs) ? localJobs : []);
                });
        };

        fetchJobs();
        const listener = () => fetchJobs();
        window.addEventListener('jobsUpdated', listener);
        return () => window.removeEventListener('jobsUpdated', listener);
    }, []);

    const handleEdit = (job: ApiJob) => {
        setSelectedJob(job);
        setIsFormOpen(true);
    };


    const handleCloseForm = () => {
        setIsFormOpen(false);
        setSelectedJob(null);
    };

    // Deleting is a manager/admin action; the endpoint enforces that with
    // requireRole, and the row button is hidden for engineers to match.
    const canDelete = userRole === 'manager' || userRole === 'admin';

    const requestDelete = (job: ApiJob) => {
        setJobPendingDelete(job);
        setDeleteDialogOpen(true);
    };

    // Runs only after the server confirms the soft delete, so the row is never
    // removed optimistically — the previous handler dropped it from the list even
    // when the request failed, which made a failed delete look like a success.
    const handleDeleted = (jobId: number) => {
        setJobs((current) => current.filter((j) => Number(j.id) !== jobId));
        setJobPendingDelete(null);
        window.dispatchEvent(new Event('jobsUpdated'));
    };

    // Filter jobs based on user role
    const visibleJobs = userRole === 'engineer'
        ? jobs.filter(j => String(j.engineer_id) === String(userId) || j.engineer_name === userName)
        : jobs;

    const totalJobs = visibleJobs.length;
    const submittedCount = visibleJobs.filter(j => isSubmitted(j.status)).length;
    const approvedCount = visibleJobs.filter(j => isApproved(j.status)).length;
    const pendingCount = visibleJobs.filter(j => isAwaitingApproval(j.status)).length;

    const downloadGlobalPDF = async () => {
        try {
            await generateGlobalPDF(visibleJobs);
        } catch (e) {
            console.error("PDF generation failed:", e);
        }
    };

    const downloadTableExcel = () => {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(visibleJobs);
        XLSX.utils.book_append_sheet(wb, ws, "Jobs");
        const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
        const blob = new Blob([wbout], { type: "application/octet-stream" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.setAttribute("download", "jobs.xlsx");
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    };

    if (isMobile && isFormOpen) {
        return (
            <div className="p-1">
                <div className="flex justify-between items-center mb-4 px-2">
                    <h2 className="text-lg font-bold text-slate-800">Job Details</h2>
                    <button onClick={handleCloseForm} className="text-sm font-semibold text-slate-600 bg-slate-100 px-3 py-2 rounded-lg">← Back</button>
                </div>
                <JobCardForm role={userRole === 'manager' ? 'manager' : 'engineer'} jobId={selectedJob?.id} onClose={handleCloseForm} />
            </div>
        );
    }

    if (isMobile) {
        return (
            <div className="p-1">
                <div className="flex justify-between items-center mb-4 px-2">
                    <h1 className="text-xl font-bold text-slate-800">Dashboard</h1>
                </div>
                <div className="mt-4">
                    {visibleJobs.map((job, index) => (
                        <motion.div
                            key={job.id || index}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.05 }}
                            onClick={() => handleEdit(job)}
                        >
                            <MobileJobCard job={job} index={index} />
                        </motion.div>
                    ))}
                </div>
            </div>
        );
    }

    if (isFormOpen && selectedJob?.id && userRole === 'manager') {
        return (
            <PricingPanel
                jobId={selectedJob.id}
                onClose={handleCloseForm}
                onApproved={() => { handleCloseForm(); window.dispatchEvent(new Event('jobsUpdated')); }}
            />
        );
    }

    if (isFormOpen && selectedJob?.id) {
        return (
            <div className="max-w-[1400px] mx-auto space-y-6">
                <div className="flex flex-wrap justify-between items-center mb-6 gap-3">
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-800">Edit Job</h2>
                    <button
                        onClick={handleCloseForm}
                        className="bg-white hover:bg-slate-50 text-slate-700 px-4 py-2.5 rounded-lg flex items-center gap-2 font-medium transition-colors border border-slate-200 shadow-sm text-sm"
                    >
                        ← Back
                    </button>
                </div>
                <JobCardForm role="engineer" jobId={selectedJob.id} onClose={handleCloseForm} />
            </div>
        );
    }

    return (
        <div className="max-w-[1400px] mx-auto space-y-6">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white/80 p-6 rounded-2xl shadow-[0_2px_10px_rgb(0,0,0,0.02)] border border-slate-200/60 backdrop-blur-xl mb-8">
                        <div>
                            <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-800 to-slate-600">
                                Dashboard
                            </h1>
                            <p className="text-sm font-medium text-slate-500 mt-1">Overview of your job cards</p>
                        </div>
                            <div className="flex flex-wrap items-center gap-2">
                            <button
                                onClick={downloadGlobalPDF}
                                className="bg-white hover:bg-slate-50 text-slate-700 px-3 py-2.5 rounded-lg flex items-center gap-1.5 font-medium transition-colors border border-slate-200 shadow-sm text-sm"
                            >
                                <Download size={16} />
                                <span className="hidden sm:inline">PDF</span>
                            </button>
                            <button
                                onClick={downloadTableExcel}
                                className="bg-white hover:bg-slate-50 text-slate-700 px-3 py-2.5 rounded-lg flex items-center gap-1.5 font-medium transition-colors border border-slate-200 shadow-sm text-sm"
                            >
                                <FileSpreadsheet size={16} className="text-green-600" />
                                <span className="hidden sm:inline">Excel</span>
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                        {[
                            { label: "Total Jobs", value: totalJobs, icon: FileText, color: "blue" },
                            { label: "Submitted", value: submittedCount, icon: Clock, color: "slate" },
                            { label: "Approved", value: approvedCount, icon: CheckCircle2, color: "emerald" },
                            { label: "Pending Review", value: pendingCount, icon: Clock, color: "amber" }
                        ].map((stat, i) => (
                            <motion.div 
                                key={stat.label}
                                custom={i}
                                variants={STAT_ANIMATION}
                                initial="hidden"
                                animate="visible"
                                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                                className="bg-white/80 backdrop-blur-md p-6 rounded-2xl border border-slate-200/60 shadow-[0_2px_10px_rgb(0,0,0,0.02)] flex flex-col justify-between h-[130px] relative overflow-hidden group"
                            >
                                <div className={`absolute top-0 right-0 w-32 h-32 bg-${stat.color}-500/5 rounded-full blur-2xl -mr-10 -mt-10 transition-opacity opacity-0 group-hover:opacity-100`} />
                                <div className="flex justify-between items-start relative z-10">
                                    <p className="text-sm font-semibold text-slate-500 tracking-wide">{stat.label}</p>
                                    <div className={`p-2.5 bg-${stat.color}-50 ring-1 ring-${stat.color}-100 rounded-xl shadow-sm`}>
                                        <stat.icon size={18} className={`text-${stat.color}-600`} />
                                    </div>
                                </div>
                                <p className="text-4xl font-extrabold text-slate-800 tracking-tight font-display">{stat.value}</p>
                            </motion.div>
                        ))}
                    </div>

                    <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4, duration: 0.5 }}
                        className="bg-white/80 backdrop-blur-md rounded-2xl border border-slate-200/60 shadow-[0_2px_10px_rgb(0,0,0,0.02)] overflow-hidden mt-8"
                    >
                        <div className="p-6 border-b border-slate-100 bg-white/50">
                            <h2 className="text-lg font-bold text-slate-800">Recent Jobs</h2>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50/50 text-slate-500 font-semibold text-[0.8rem] uppercase tracking-wider">
                                    <tr>
                                        <th className="px-6 py-4 whitespace-nowrap">Job #</th>
                                        <th className="px-6 py-4">Customer</th>
                                        <th className="px-6 py-4">Technician</th>
                                        <th className="px-6 py-4">Manager</th>
                                        <th className="px-6 py-4">Date</th>
                                        <th className="px-6 py-4">Status</th>
                                        <th className="px-6 py-4 text-right">Total</th>
                                        <th className="px-6 py-4"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100/80 bg-white">
                                    <AnimatePresence>
                                        {visibleJobs.map((job, idx) => (
                                            <motion.tr 
                                                key={job.id || idx}
                                                initial={{ opacity: 0, x: -10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: 0.5 + (idx * 0.05) }}
                                                className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                                                onClick={() => handleEdit(job)}
                                            >
                                                <td className="px-6 py-4.5 font-bold text-slate-900">{job.job_card_no || job.id}</td>
                                                <td className="px-6 py-4.5 text-slate-600 font-medium">{job.customer_name}</td>
                                                <td className="px-6 py-4.5 text-slate-600">
                                                    <div className="flex items-center gap-2">
                                                        <div className="h-6 w-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600">
                                                            {(getEngineerName(job) || "—").substring(0,2).toUpperCase()}
                                                        </div>
                                                        {getEngineerName(job) || "—"}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4.5 text-slate-600">
                                                    <div className="flex items-center gap-2">
                                                        <div className="h-6 w-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600">
                                                            {(getManagerName(job) || "—").substring(0,2).toUpperCase()}
                                                        </div>
                                                        {getManagerName(job) || "—"}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4.5 text-slate-500 font-medium">{job.job_date || "—"}</td>
                                                <td className="px-6 py-4.5">{getStatusBadge(job.status)}</td>
                                                <td className="px-6 py-4.5 text-slate-900 font-bold text-right">{job.grand_total ? (typeof job.grand_total === 'number' ? `₹${job.grand_total.toFixed(2)}` : job.grand_total) : "—"}</td>
                                                <td className="px-6 py-4.5 text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleEdit(job); }}
                                                            className="text-sm font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                                        >
                                                            Review Report
                                                        </button>
                                                        {canDelete && (
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); requestDelete(job); }}
                                                                aria-label={`Delete job card ${job.job_card_no || job.id}`}
                                                                title="Delete job card"
                                                                className="text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 p-1.5 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                                            >
                                                                <Trash2 size={16} />
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
                    </motion.div>

                    <DeleteJobDialog
                        job={jobPendingDelete}
                        open={deleteDialogOpen}
                        onOpenChange={setDeleteDialogOpen}
                        onDeleted={handleDeleted}
                    />
        </div>
    );
};

export default DashboardContent;