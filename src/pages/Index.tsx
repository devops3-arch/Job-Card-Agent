import { useState } from "react";
import JobCardForm from "@/components/jobcard/JobCardForm";
import JobList from "../components/JobList";

const Index = () => {
    const [currentRole, setCurrentRole] = useState<'engineer' | 'manager'>('engineer');

    return (
        <div className="min-h-screen bg-background">
            {/* Simple Role Switch Navbar for Testing */}
            <div style={{ padding: "15px", display: "flex", gap: "15px", justifyContent: "center", background: "#fff", borderBottom: "1px solid #ddd" }}>
                 <button 
                    onClick={() => setCurrentRole('engineer')}
                    style={{
                        padding: "10px 20px",
                        borderRadius: "8px",
                        border: "none",
                        cursor: "pointer",
                        fontWeight: "bold",
                        background: currentRole === 'engineer' ? "#0f172a" : "#f1f5f9",
                        color: currentRole === 'engineer' ? "#fff" : "#333",
                    }}
                 >
                    👷 Engineer View
                 </button>
                 <button 
                    onClick={() => setCurrentRole('manager')}
                    style={{
                        padding: "10px 20px",
                        borderRadius: "8px",
                        border: "none",
                        cursor: "pointer",
                        fontWeight: "bold",
                        background: currentRole === 'manager' ? "#0f172a" : "#f1f5f9",
                        color: currentRole === 'manager' ? "#fff" : "#333",
                    }}
                 >
                    👨‍💼 Manager View
                 </button>
            </div>

            {currentRole === 'engineer' ? (
                <div style={{ padding: "20px" }}>
                    <h2 style={{ textAlign: "center", marginBottom: "10px", color: "#666" }}>Submit New Job Card</h2>
                    <JobCardForm />
                </div>
            ) : (
                <div style={{ padding: "20px", background: "#f5f5f5", minHeight: "100vh" }}>
                    <h2 style={{ textAlign: "center", marginBottom: "10px", color: "#666" }}>Review & Approve Jobs</h2>
                    <JobList />
                </div>
            )}
        </div>
    );
};

export default Index;