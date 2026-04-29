import { useEffect, useState } from "react";
import JobCardForm from "./jobcard/JobCardForm";
import { generatePDF } from "@/utils/exportPdf";
import { generateExcel } from "@/utils/exportExcel";

const JobList = () => {
    const [jobs, setJobs] = useState<any[]>([]);
    const [viewJobId, setViewJobId] = useState<number | null>(null);

    // Fetch jobs from backend
    const fetchJobs = async () => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000); // 2 second timeout
            const res = await fetch("http://localhost:5000/jobs?ts=" + new Date().getTime(), { signal: controller.signal });
            clearTimeout(timeoutId);
            if (!res.ok) throw new Error("Backend connection failed");
            const data = await res.json();
            setJobs(Array.isArray(data.data) ? data.data : []);
        } catch (err) {
            console.error("Backend fetch failed, using local mock data.");
            const localJobs = JSON.parse(localStorage.getItem('mockJobs') || '[]');
            setJobs(localJobs);
        }
    };

    // Update job status (Approve / Reject)
    const updateStatus = async (id: number, status: string) => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);
            const res = await fetch(`http://localhost:5000/jobs/${id}/status`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ status }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            
            if (!res.ok) throw new Error("Backend connection failed");

            fetchJobs();

        } catch (error) {
            console.error("Using local mock update logic.");
            const localJobs = JSON.parse(localStorage.getItem('mockJobs') || '[]');
            const updatedJobs = localJobs.map((j: any) => String(j.id) === String(id) ? { ...j, status } : j);
            localStorage.setItem('mockJobs', JSON.stringify(updatedJobs));
            fetchJobs();
            const event = new Event('jobsUpdated');
            window.dispatchEvent(event);
        }
    };

    // Load jobs on page load and auto-refresh every 5 seconds
    useEffect(() => {
        fetchJobs();

        const interval = setInterval(() => {
            fetchJobs();
        }, 5000);

        const listener = () => fetchJobs();
        window.addEventListener('jobsUpdated', listener);

        return () => {
            clearInterval(interval);
            window.removeEventListener('jobsUpdated', listener);
        };
    }, []);

    if (!Array.isArray(jobs)) {
        return <p>Loading...</p>;
    }

    return (
        <div style={{ padding: "20px" }}>
            {viewJobId ? (
                <div>
                    <button 
                        onClick={() => setViewJobId(null)}
                        style={{
                            marginBottom: "20px", 
                            padding: "8px 16px",
                            background: "#333",
                            color: "white",
                            border: "none",
                            borderRadius: "4px",
                            cursor: "pointer"
                        }}
                    >
                        &larr; Back to Job List
                    </button>
                    <JobCardForm role="manager" jobId={viewJobId} />
                </div>
            ) : (
                <>
                    <h2>Saved Jobs</h2>

            {jobs.length === 0 ? (
                <p>No jobs found</p>
            ) : (
                <table style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    background: "white"
                }}>
                    <thead>
                        <tr>
                            <th style={{ borderBottom: "1px solid #ddd", padding: "10px", textAlign: "left" }}>
                                ID
                            </th>
                            <th>Job Card No</th>
                            <th>Customer</th>
                            <th>Equipment</th>
                            <th>Date</th>
                            <th>Sales Area</th>
                            <th>Service Type</th>
                            <th>Status</th>
                            <th>Total Cost</th>
                            <th>Actions</th>
                        </tr>
                    </thead>

                    <tbody>
                        {jobs.map((job) => (
                            <tr key={job.id}>
                                <td style={{ borderBottom: "1px solid #eee", padding: "10px" }}>
                                    {job.id}
                                </td>
                                <td>{job.job_card_no || "—"}</td>
                                <td>{job.customer_name}</td>
                                <td>{job.equipment_name}</td>
                                <td>{job.job_date || "—"}</td>
                                <td>{job.sales_area || "—"}</td>
                                <td>{job.service_type || "—"}</td>
                                <td>{job.status}</td>
                                <td>
                                    {job.grand_total ? `AED ${job.grand_total}` : "N/A"}
                                </td>

                                <td>
                                    <button
                                        onClick={() => setViewJobId(job.id)}
                                        style={{
                                            marginRight: "5px",
                                            background: "blue",
                                            color: "white",
                                            padding: "5px 10px",
                                            border: "none",
                                            cursor: "pointer"
                                        }}
                                    >
                                        Edit / Price
                                    </button>

                                    {job.status !== "APPROVED" && (
                                    <>
                                        <button
                                            onClick={() => updateStatus(job.id, "APPROVED")}
                                            style={{
                                                marginRight: "5px",
                                                background: "green",
                                                color: "white",
                                                padding: "5px 10px",
                                                border: "none",
                                                cursor: "pointer"
                                            }}
                                        >
                                            Approve
                                        </button>

                                        <button
                                            onClick={() => updateStatus(job.id, "REJECTED")}
                                            style={{
                                                marginRight: "5px",
                                                background: "red",
                                                color: "white",
                                                padding: "5px 10px",
                                                border: "none",
                                                cursor: "pointer"
                                            }}
                                        >
                                            Reject
                                        </button>
                                    </>
                                    )}

                                    {job.status === "APPROVED" && (
                                    <>
                                        <button
                                            onClick={() => generatePDF(job)}
                                            style={{
                                                marginRight: "5px",
                                                background: "#4f46e5",
                                                color: "white",
                                                padding: "5px 10px",
                                                border: "none",
                                                cursor: "pointer"
                                            }}
                                        >
                                            📄 PDF
                                        </button>

                                        <button
                                            onClick={() => generateExcel(job)}
                                            style={{
                                                background: "#10b981",
                                                color: "white",
                                                padding: "5px 10px",
                                                border: "none",
                                                cursor: "pointer"
                                            }}
                                        >
                                            📊 Excel
                                        </button>
                                    </>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
            </>
            )}
        </div>
    );
};

export default JobList;