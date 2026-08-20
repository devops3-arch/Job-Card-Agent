import { useEffect, useState } from "react";
import type { ApiJob } from "@/types/jobCard";
import { apiFetch } from "@/lib/api";
import { isApproved, isAwaitingApproval, isSubmitted } from "@/lib/jobStatus";
import { CheckCircle2, Clock, FileText, Download, FileSpreadsheet } from "lucide-react";
import JobCardForm from "./jobcard/JobCardForm";
import JobCardGrid from "./jobcard/JobCardGrid";
import PricingPanel from "./PricingPanel";
import { generateGlobalPDF } from "@/utils/exportPdf";
import { generateExcel } from "@/utils/exportExcel";
import * as XLSX from "xlsx-js-style";
import { motion } from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileJobCard } from "./MobileJobCard";

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

    const handleDelete = async (jobId: string) => {
        try {
            const res = await apiFetch(`/jobs/${jobId}`, { method: 'DELETE' });
            if (!res.ok) throw new Error("Backend delete failed");
        } catch {
            // fallback: remove from localStorage mock too
        }
        const updatedJobs = jobs.filter(j => String(j.id) !== String(jobId));
        localStorage.setItem('mockJobs', JSON.stringify(updatedJobs));
        setJobs(updatedJobs);
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

                    <JobCardGrid
                        jobs={visibleJobs}
                        onOpen={handleEdit}
                        getEngineerName={getEngineerName}
                        getManagerName={getManagerName}
                        actionLabel={userRole === "manager" ? "Review report" : "Open job card"}
                    />
        </div>
    );
};

export default DashboardContent;