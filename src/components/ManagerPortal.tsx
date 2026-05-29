import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { CheckCircle2, Clock, FileText, Activity } from "lucide-react";
import { Badge } from "./ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileJobCard } from "./MobileJobCard";
import JobCardForm from "./jobcard/JobCardForm";
import PricingPanel from "./PricingPanel";

const STAT_ANIMATION = {
    hidden: { opacity: 0, y: 20 },
    visible: (i: number) => ({
        opacity: 1, y: 0,
        transition: { delay: i * 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }
    })
};

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

const ManagerPortal = () => {
    const [jobs, setJobs] = useState<any[]>([]);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [selectedJob, setSelectedJob] = useState<any>(null);
    const user = (() => { try { return JSON.parse(localStorage.getItem("user") || "{}"); } catch { return {}; } })();
    const userId = user?.id;
    const userName = user?.name || user?.fullName || "";

    const isPending = (s: string) => {
        const status = (s ?? "").toUpperCase();
        return !status || status === "DRAFT" || status === "WAITING_PRICING" || status === "PENDING_APPROVAL" || status.includes("SUBMIT") || status.includes("REVIEW") || status.includes("PEND");
    };

    const isAssignedJob = (job: any) => {
        return String(job.manager_id) === String(userId) || String(job.manager_name) === String(userName) || String(job.managerName) === String(userName);
    };

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
                    let fetchedJobs = Array.isArray(data.data) ? data.data : [];
                    setJobs(fetchedJobs.sort((a: any, b: any) => new Date(b.job_date).getTime() - new Date(a.job_date).getTime()));
                })
                .catch(() => {
                    const localJobs = JSON.parse(localStorage.getItem('mockJobs') || '[]');
                    setJobs(Array.isArray(localJobs) ? localJobs.sort((a: any, b: any) => new Date(b.job_date || b.date).getTime() - new Date(a.job_date || a.date).getTime()) : []);
                });
        };

        fetchJobs();
        const listener = () => fetchJobs();
        window.addEventListener('jobsUpdated', listener);
        return () => window.removeEventListener('jobsUpdated', listener);
    }, []);

    const visibleJobs = jobs.filter(isAssignedJob);
    const pendingJobs = visibleJobs.filter(j => isPending(j.status)).length;
    const approvedJobs = visibleJobs.filter(j => (j.status ?? "").toUpperCase().includes('APPROV')).length;

    const statCards = [
        { title: "To Approve", value: pendingJobs.toString(), icon: <Activity className="text-amber-500" size={22} />, gradient: "from-amber-500/20 to-orange-500/5", border: "border-amber-200/50" },
        { title: "Approved", value: approvedJobs.toString(), icon: <CheckCircle2 className="text-emerald-500" size={22} />, gradient: "from-emerald-500/20 to-teal-500/5", border: "border-emerald-200/50" },
        { title: "Total Jobs", value: visibleJobs.length.toString(), icon: <FileText className="text-blue-500" size={22} />, gradient: "from-blue-500/20 to-indigo-500/5", border: "border-blue-200/50" }
    ];

    const updateJobStatus = (jobId: string, status: 'APPROVED' | 'REJECTED') => {
        apiFetch(`/jobs/${jobId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        })
        .then(res => {
            if (!res.ok) throw new Error("Backend response not ok");
            return res.json();
        })
        .then(data => {
            if (data.success) {
                const updatedJobs = jobs.map(j => String(j.id) === String(jobId) ? { ...j, status } : j);
                localStorage.setItem('mockJobs', JSON.stringify(updatedJobs));
                setJobs(updatedJobs);
                window.dispatchEvent(new Event('jobsUpdated'));
            }
        })
        .catch(() => {
            const updatedJobs = jobs.map(j => String(j.id) === String(jobId) ? { ...j, status } : j);
            localStorage.setItem('mockJobs', JSON.stringify(updatedJobs));
            setJobs(updatedJobs);
            window.dispatchEvent(new Event('jobsUpdated'));
        });
    };

    const approveJob = (jobId: string) => {
        // Fast Approve API Call
        apiFetch(`/jobs/${jobId}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ status: 'APPROVED' })
        })
        .then(res => {
            if (!res.ok) throw new Error("Backend response not ok");
            return res.json();
        })
        .then(data => {
            if (data.success) {
                // Update local if successful
                const updatedJobs = jobs.map(j => {
                    if (String(j.id) === String(jobId)) {
                        return { ...j, status: 'APPROVED' };
                    }
                    return j;
                });
                localStorage.setItem('mockJobs', JSON.stringify(updatedJobs));
                setJobs(updatedJobs);
                window.dispatchEvent(new Event('jobsUpdated'));
            }
        })
        .catch(err => {
            console.error("Fast approve failed, saving to local only:", err);
            // Fallback for mock jobs
            const updatedJobs = jobs.map(j => {
                if (String(j.id) === String(jobId)) {
                    return { ...j, status: 'APPROVED' };
                }
                return j;
            });
            localStorage.setItem('mockJobs', JSON.stringify(updatedJobs));
            setJobs(updatedJobs);
            window.dispatchEvent(new Event('jobsUpdated'));
        });
    };

    const handleReviewJob = (job: any) => {
        setSelectedJob(job);
        setIsFormOpen(true);
    };

    const handleCloseForm = () => {
        setIsFormOpen(false);
        setSelectedJob(null);
    };

    const isMobile = useIsMobile();

    if (isFormOpen && selectedJob?.id) {
        return (
            <div className="max-w-[1400px] mx-auto p-4 md:p-8">
                <PricingPanel
                    jobId={selectedJob.id}
                    onClose={handleCloseForm}
                    onApproved={() => { handleCloseForm(); window.dispatchEvent(new Event('jobsUpdated')); }}
                />
            </div>
        );
    }

    return (
        <div className="max-w-[1400px] mx-auto space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white/80 p-4 sm:p-6 rounded-2xl shadow-[0_2px_10px_rgb(0,0,0,0.02)] border border-slate-200/60 backdrop-blur-xl mb-8">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-800 to-slate-600">
                                Assigned Job Cards
                            </h1>
                            <p className="text-sm font-medium text-slate-500 mt-1">Jobs assigned to your manager account</p>
                </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6 mb-8">
                {statCards.map((stat, i) => (
                    <motion.div 
                        custom={i} initial="hidden" animate="visible" variants={STAT_ANIMATION}
                        key={i}
                        className={`bg-gradient-to-br ${stat.gradient} ${stat.border} border p-6 rounded-3xl relative overflow-hidden group`}
                    >
                        <div className="absolute top-0 right-0 p-6 opacity-40 group-hover:scale-110 group-hover:opacity-60 transition-all duration-500 delay-75">
                            {stat.icon}
                        </div>
                        <div className="relative z-10">
                            <p className="text-slate-600 font-semibold mb-2">{stat.title}</p>
                            <h3 className="text-4xl font-bold text-slate-800">{stat.value}</h3>
                        </div>
                    </motion.div>
                ))}
            </div>
            </div>

            {/* Mobile card layout */}
            {isMobile ? (
                <div className="space-y-3">
                    <AnimatePresence>
                        {jobs.filter(j => isPending(j.status)).map((job, index) => (
                            <motion.div
                                key={job.id || index}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{ delay: index * 0.05 }}
                                className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-4"
                            >
                                <div className="flex justify-between items-start mb-3">
                                    <div>
                                        <p className="font-semibold text-slate-800">{job.customer_name || "Unknown"}</p>
                                        <p className="text-xs text-slate-500 mt-0.5">{job.engineer_name || "Unassigned"}</p>
                                    </div>
                                    {getStatusBadge(job.status)}
                                </div>
                                <div className="flex items-center gap-2 text-sm text-slate-600 mb-4">
                                    <Clock size={13} className="text-slate-400" />
                                    <span>{job.job_date || job.date || "N/A"}</span>
                                    <span className="text-slate-400">·</span>
                                    <span className="font-semibold text-slate-700">{job.id || `JOB-${1000 + index}`}</span>
                                </div>
                                {isPending(job.status) && (
                                    <div className="flex gap-2 pt-3 border-t border-slate-100">
                                        <button
                                            onClick={() => handleReviewJob(job)}
                                            className="flex-1 bg-white hover:bg-slate-50 text-slate-700 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-sm border border-slate-200 active:scale-95 min-h-[44px]"
                                        >
                                            Review
                                        </button>
                                        <button
                                            onClick={() => updateJobStatus(job.id, 'REJECTED')}
                                            className="flex-1 bg-red-500 hover:bg-red-600 text-white py-2.5 rounded-xl text-sm font-semibold transition-all shadow-sm shadow-red-500/20 active:scale-95 min-h-[44px]"
                                        >
                                            Reject
                                        </button>
                                        <button
                                            onClick={() => approveJob(job.id)}
                                            className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-2.5 rounded-xl text-sm font-semibold transition-all shadow-sm shadow-emerald-500/20 active:scale-95 min-h-[44px]"
                                        >
                                            Approve
                                        </button>
                                    </div>
                                )}
                            </motion.div>
                        ))}
                    </AnimatePresence>
                    {visibleJobs.length === 0 && (
                        <p className="text-center text-slate-500 font-medium py-8">No assigned job cards found.</p>
                    )}
                </div>
            ) : (
                /* Desktop table */
                <div className="bg-white/80 backdrop-blur-xl rounded-3xl border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-slate-200/50 bg-slate-50/50">
                                    <th className="p-4 font-semibold text-slate-600 text-sm">Job ID</th>
                                    <th className="p-4 font-semibold text-slate-600 text-sm">Customer</th>
                                    <th className="p-4 font-semibold text-slate-600 text-sm">Date</th>
                                    <th className="p-4 font-semibold text-slate-600 text-sm">Status</th>
                                    <th className="p-4 font-semibold text-slate-600 text-sm text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                <AnimatePresence>
                                    {visibleJobs.map((job, index) => (
                                        <motion.tr
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, scale: 0.95 }}
                                            transition={{ delay: index * 0.05 }}
                                            key={job.id || index}
                                            className="border-b border-slate-100 hover:bg-slate-50/80 transition-colors group"
                                        >
                                            <td className="p-4">
                                                <span className="font-semibold text-slate-800">{job.id || `JOB-${1000 + index}`}</span>
                                            </td>
                                            <td className="p-4">
                                                <div className="font-medium text-slate-700">{job.customer_name || "Unknown"}</div>
                                                <div className="text-xs text-slate-500 mt-1">{job.engineer_name || "Unassigned"}</div>
                                            </td>
                                            <td className="p-4 text-sm text-slate-600 font-medium">
                                                <div className="flex items-center gap-2">
                                                    <Clock size={14} className="text-slate-400" />
                                                    {job.job_date || job.date || "N/A"}
                                                </div>
                                            </td>
                                            <td className="p-4">{getStatusBadge(job.status)}</td>
                                            <td className="p-4 text-right">
                                                <div className="flex justify-end flex-wrap gap-2">
                                                    <button
                                                        onClick={() => handleReviewJob(job)}
                                                        className="bg-white hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-xl text-sm font-semibold transition-all shadow-sm border border-slate-200 active:scale-95"
                                                    >
                                                        Review & Edit Prices
                                                    </button>
                                                    <button
                                                        onClick={() => updateJobStatus(job.id, 'REJECTED')}
                                                        className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-all shadow-sm shadow-red-500/20 active:scale-95"
                                                    >
                                                        Reject
                                                    </button>
                                                    <button
                                                        onClick={() => approveJob(job.id)}
                                                        className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-all shadow-sm shadow-emerald-500/20 active:scale-95"
                                                    >
                                                        Fast Approve
                                                    </button>
                                                </div>
                                            </td>
                                        </motion.tr>
                                    ))}
                                </AnimatePresence>
                                {visibleJobs.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="p-8 text-center text-slate-500 font-medium">
                                            No assigned job cards found.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ManagerPortal;
