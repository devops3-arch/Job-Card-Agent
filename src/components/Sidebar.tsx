import { LayoutDashboard, PlusCircle, Users, UserCog, LogOut, Hexagon } from "lucide-react";
import { motion } from "framer-motion";

interface SidebarProps {
    currentRole?: string;
    onRoleChange?: (role: 'dashboard' | 'engineer' | 'manager' | 'users' | 'profile') => void;
    isMobile?: boolean;
}

const getUser = () => {
    try {
        const raw = localStorage.getItem("user");
        if (raw) return JSON.parse(raw);
    } catch {}
    return null;
};

const handleSignOut = () => {
    localStorage.removeItem("authToken");
    localStorage.removeItem("user");
    window.location.href = "/auth";
};

const Sidebar = ({ currentRole = 'dashboard', onRoleChange, isMobile = false }: SidebarProps) => {
    const user = getUser();
    const userRole = user?.role || '';
    const displayName = user?.fullName || user?.name || user?.email?.split("@")[0] || "User";
    const displayEmail = user?.email || "";
    const initials = displayName.substring(0, 2).toUpperCase();

    // Role-based tab visibility
    const navItems = [
        { role: 'dashboard' as const, icon: LayoutDashboard, label: 'Dashboard', visible: true },
        { role: 'engineer' as const, icon: PlusCircle, label: 'New Job', visible: userRole === 'engineer' },
        { role: 'manager' as const, icon: UserCog, label: 'Assigned Job Cards', visible: userRole === 'manager' },
        { role: 'users' as const, icon: Users, label: 'Users', visible: userRole === 'manager' },
    ].filter(item => item.visible);

    return (
        <aside className={`w-[280px] bg-slate-900/95 backdrop-blur-xl text-white ${isMobile ? 'flex' : 'hidden md:flex'} flex-col h-[calc(100vh-24px)] shrink-0 rounded-3xl my-3 ml-3 shadow-[0_8px_30px_rgb(0,0,0,0.12)] py-6 z-50 border border-white/10 relative overflow-hidden`}>
            {/* Decorative background glows */}
            <div className="absolute top-0 left-0 w-full h-40 bg-blue-500/10 blur-[50px] -z-10 rounded-full" />
            <div className="absolute bottom-0 right-0 w-full h-40 bg-indigo-500/10 blur-[50px] -z-10 rounded-full" />

            {/* Logo */}
            <div className="flex items-center gap-3 px-8 pb-4 mb-2">
                <div className="w-9 h-9 bg-gradient-to-tr from-blue-600 to-indigo-500 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                    <Hexagon size={20} className="text-white fill-white/20" />
                </div>
                <h1 className="text-xl font-bold tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-300">JobFlow Pro</h1>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-4 space-y-1.5 mt-2 overflow-y-auto custom-scrollbar">
                {navItems.map(({ role, icon: Icon, label }) => (
                    <button
                        key={role}
                        onClick={() => onRoleChange && onRoleChange(role)}
                        className={`relative flex w-full items-center gap-3 px-4 py-3.5 rounded-xl font-medium transition-all duration-300 cursor-pointer group ${currentRole === role ? 'text-white' : 'text-slate-400 hover:text-white'}`}
                    >
                        {currentRole === role && (
                            <motion.div layoutId="activeTab" className="absolute inset-0 bg-blue-600/10 border border-blue-500/20 rounded-xl -z-10" />
                        )}
                        <Icon
                            size={20}
                            className={currentRole === role ? "text-blue-400" : "text-slate-400 group-hover:-translate-y-0.5 transition-transform"}
                        />
                        {label}
                    </button>
                ))}
            </nav>

            {/* User profile + Sign Out */}
            <div className="px-4 mt-auto">
                <div
                    onClick={() => onRoleChange && onRoleChange('profile')}
                    className={`w-full text-left rounded-2xl p-4 border relative z-50 cursor-pointer group/profile transition-all duration-300 ${currentRole === 'profile' ? 'bg-white/10 border-white/20 shadow-lg' : 'bg-slate-800/40 border-white/5 hover:bg-slate-800/80 hover:border-white/10 shadow-sm'}`}
                >
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shrink-0 border border-white/10">
                            <span className="text-sm font-bold text-white">{initials}</span>
                        </div>
                        <div className="overflow-hidden">
                            <p className="text-sm font-semibold text-white truncate">{displayName}</p>
                            {displayEmail && (
                                <p className="text-[11px] text-slate-400 truncate">{displayEmail}</p>
                            )}
                        </div>
                    </div>

                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            handleSignOut();
                        }}
                        className="flex items-center justify-center gap-2 text-xs font-semibold text-slate-300 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all w-full group py-2.5 cursor-pointer relative z-50"
                    >
                        <LogOut size={16} className="transition-transform group-hover:-translate-x-1" />
                        Sign Out
                    </button>
                </div>
            </div>
        </aside>
    );
};

export default Sidebar;
