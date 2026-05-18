import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { generatePDF } from "@/utils/exportPdf";
import { generateExcel } from "@/utils/exportExcel";
import { API_BASE_URL, getDevAuthHeaders } from "@/lib/api";

interface JobListProps {
  role: "engineer" | "manager" | "admin";
}

const JobList = ({ role }: JobListProps) => {
    const [jobs, setJobs] = useState<any[]>([]);
    const navigate = useNavigate();

    // Fetch jobs from backend
    const fetchJobs = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/jobs`, {
              headers: {
                "Content-Type": "application/json",
                ...getDevAuthHeaders(role),
              },
            });
            if (!res.ok) throw new Error("Backend connection failed");
            const data = await res.json();
            setJobs(Array.isArray(data.data) ? data.data : []);
        } catch (err) {
            console.error("Failed to fetch jobs:", err);
            setJobs([]);
        }
    };

    // Update job status (Approve / Reject)
    const updateStatus = async (id: number, status: string) => {
        try {
            const res = await fetch(`${API_BASE_URL}/jobs/${id}/status`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    ...getDevAuthHeaders(role),
                },
                body: JSON.stringify({ status }),
            });

            if (!res.ok) throw new Error("Backend connection failed");

            fetchJobs();
        } catch (error) {
            console.error("Failed to update job status:", error);
        }
    };

    // Load jobs on page load and auto-refresh every 5 seconds
    useEffect(() => {
        fetchJobs();

        const interval = setInterval(() => {
            fetchJobs();
        }, 5000);

        return () => {
            clearInterval(interval);
        };
    }, []);

    if (!Array.isArray(jobs)) {
        return <p>No data</p>;
    }

    return (
        <div style={{ padding: "20px" }}>
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
                            <tr key={job?.id ?? Math.random()}>
                                <td style={{ borderBottom: "1px solid #eee", padding: "10px" }}>
                                    {job?.id ?? "—"}
                                </td>
                                <td>{job?.job_card_no ?? "—"}</td>
                                <td>{job?.customer_name ?? "—"}</td>
                                <td>{job?.equipment_name ?? "—"}</td>
                                <td>{job?.job_date ?? "—"}</td>
                                <td>{job?.sales_area ?? "—"}</td>
                                <td>{job?.service_type ?? "—"}</td>
                                <td>{job?.status ?? "—"}</td>
                                <td>
                                    {job?.grand_total ? `AED ${job.grand_total}` : "N/A"}
                                </td>

                                <td>
                                    <button
                                        onClick={() => navigate(`/edit-job/${job?.id}`)}
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

                                    {role === "manager" && job?.status !== "APPROVED" && (
                                    <>
                                        <button
                                            onClick={() => updateStatus(job?.id, "APPROVED")}
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
                                            onClick={() => updateStatus(job?.id, "REJECTED")}
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

                                    {job?.status === "APPROVED" && (
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
        </div>
    );
};

export default JobList;