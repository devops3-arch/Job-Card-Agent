import { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import DashboardContent from "@/components/DashboardContent";
import JobCardForm from "@/components/jobcard/JobCardForm";
import UserManagement from "@/components/UserManagement";
import ProfileSettings from "@/components/ProfileSettings";
import ManagerPortal from "@/components/ManagerPortal";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu } from "lucide-react";

const Index = () => {
    const [currentRole, setCurrentRole] = useState<'engineer' | 'manager' | 'users' | 'dashboard' | 'profile'>('dashboard');
    const [isSheetOpen, setIsSheetOpen] = useState(false);
    const [managerEditJobId, setManagerEditJobId] = useState<number | null>(null);

    // Listen for Edit Job events fired from PricingPanel
    useEffect(() => {
        const handler = (e: Event) => {
            const jobId = (e as CustomEvent).detail?.jobId;
            if (jobId) setManagerEditJobId(Number(jobId));
        };
        window.addEventListener('openEditJob', handler);
        return () => window.removeEventListener('openEditJob', handler);
    }, []);

    const handleRoleChange = (role: 'engineer' | 'manager' | 'users' | 'dashboard' | 'profile') => {
        setCurrentRole(role);
        setManagerEditJobId(null);
        setIsSheetOpen(false);
    };

    return (
        <div className="min-h-screen bg-slate-50 flex">
            <Sidebar currentRole={currentRole} onRoleChange={handleRoleChange} />

            <div className="flex-1 flex flex-col h-screen overflow-hidden">
                <div className="md:hidden flex items-center justify-between p-4 bg-white/80 backdrop-blur-xl border-b border-slate-200/60 z-40 relative">
                    <h1 className="text-lg font-bold tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-slate-800 to-slate-600">JobFlow Pro</h1>
                    <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
                        <SheetTrigger asChild>
                            <button className="p-2 bg-slate-100 rounded-lg text-slate-600 hover:bg-slate-200 transition-colors">
                                <Menu size={20} />
                            </button>
                        </SheetTrigger>
                        <SheetContent side="left" className="w-[310px] p-0 border-r-0 bg-transparent flex items-start">
                            <Sidebar currentRole={currentRole} onRoleChange={handleRoleChange} isMobile={true} />
                        </SheetContent>
                    </Sheet>
                </div>

                <main className="flex-1 overflow-y-auto p-4 md:p-8">
                    {managerEditJobId ? (
                        <div className="max-w-[1400px] mx-auto space-y-6">
                            <div className="flex flex-wrap justify-between items-center mb-6 gap-3">
                                <h2 className="text-xl sm:text-2xl font-bold text-slate-800">Edit Job</h2>
                                <button
                                    onClick={() => setManagerEditJobId(null)}
                                    className="bg-white hover:bg-slate-50 text-slate-700 px-4 py-2.5 rounded-lg flex items-center gap-2 font-medium transition-colors border border-slate-200 shadow-sm text-sm"
                                >
                                    ← Back
                                </button>
                            </div>
                            <JobCardForm
                                role="manager"
                                jobId={managerEditJobId}
                                onClose={() => setManagerEditJobId(null)}
                            />
                        </div>
                    ) : currentRole === 'engineer' ? (
                        <div className="max-w-[1400px] mx-auto space-y-6">
                            <div className="flex flex-wrap justify-between items-center mb-6 gap-3">
                                <h2 className="text-xl sm:text-2xl font-bold text-slate-800">Submit New Job Card</h2>
                                <button
                                    onClick={() => setCurrentRole('dashboard')}
                                    className="bg-white hover:bg-slate-50 text-slate-700 px-4 py-2.5 rounded-lg flex items-center gap-2 font-medium transition-colors border border-slate-200 shadow-sm cursor-pointer text-sm min-h-[44px]"
                                >
                                    ← Dashboard
                                </button>
                            </div>
                            <JobCardForm />
                        </div>
                    ) : currentRole === 'users' ? (
                        <div className="max-w-[1400px] mx-auto space-y-6">
                            <UserManagement />
                        </div>
                    ) : currentRole === 'profile' ? (
                        <ProfileSettings />
                    ) : currentRole === 'manager' ? (
                        <ManagerPortal />
                    ) : (
                        <DashboardContent
                            currentRole={currentRole}
                            setCurrentRole={handleRoleChange}
                        />
                    )}
                </main>
            </div>
        </div>
    );
};

export default Index;
