import React, { useState, useEffect } from 'react';
import { apiFetch } from "@/lib/api";
import { Trash2, Users, ShieldAlert } from 'lucide-react';
import { Badge } from './ui/badge';
import { motion } from 'framer-motion';
import { useIsMobile } from '@/hooks/use-mobile';
import { toast } from 'sonner';

interface User {
    id: number;
    full_name: string;
    email: string;
    role: string | null;
}

const UserManagement = () => {
    const isMobile = useIsMobile();
    const [users, setUsers] = useState<User[]>([]);
    const [selectedUserId, setSelectedUserId] = useState<string>("");
    const [selectedRole, setSelectedRole] = useState<string>("");
    const [searchQuery, setSearchQuery] = useState<string>("");
    const [loading, setLoading] = useState(false);

    const fetchUsers = () => {
        apiFetch("/users")
            .then(r => r.json())
            .then(d => { if (d.success) setUsers(d.data); })
            .catch(() => toast.error("Could not load users from server"));
    };

    useEffect(() => { fetchUsers(); }, []);

    const filteredUsers = users.filter(u =>
        u.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.email.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleSelectUser = (user: User) => {
        setSelectedUserId(String(user.id));
        setSearchQuery(user.full_name);
        if (user.role) setSelectedRole(user.role);
    };

    const handleSave = async () => {
        if (!selectedUserId) { toast.error("Please select a user first"); return; }
        if (!selectedRole) { toast.error("Please select a role"); return; }
        setLoading(true);
        try {
            const res = await apiFetch(`/users/${selectedUserId}/role`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role: selectedRole }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);
            toast.success("Role assigned successfully");
            setSelectedUserId("");
            setSelectedRole("");
            setSearchQuery("");
            fetchUsers();
        } catch (err: any) {
            toast.error(err.message || "Failed to assign role");
        } finally {
            setLoading(false);
        }
    };

    const handleRemoveRole = async (userId: number) => {
        try {
            const res = await apiFetch(`/users/${userId}/role`, { method: 'DELETE' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);
            toast.success("Role removed");
            fetchUsers();
        } catch (err: any) {
            toast.error(err.message || "Failed to remove role");
        }
    };

    const showDropdown = searchQuery.length > 0 && !selectedUserId && filteredUsers.length > 0;

    return (
        <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-[1400px] mx-auto space-y-8"
        >
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white/80 p-4 sm:p-8 rounded-3xl shadow-[0_2px_15px_rgb(0,0,0,0.03)] border border-slate-200/60 backdrop-blur-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl -mr-20 -mt-20" />
                <div className="relative z-10 flex items-center gap-4">
                    <div className="w-12 h-12 bg-indigo-500/10 text-indigo-600 rounded-2xl flex items-center justify-center ring-1 ring-indigo-500/20 shadow-sm">
                        <Users size={24} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-800 to-slate-600">User Management</h1>
                        <p className="text-sm font-medium text-slate-500">Configure access levels and team roles</p>
                    </div>
                </div>
            </div>

            {/* Assignment Form */}
            <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1, duration: 0.4 }}
                className="bg-white p-4 sm:p-7 rounded-3xl shadow-[0_2px_15px_rgb(0,0,0,0.03)] border border-slate-200/60 flex flex-col md:flex-row items-end gap-3 sm:gap-5 relative z-10"
            >
                <div className="flex-1 w-full relative group">
                    <label className="block text-[0.8rem] font-bold text-slate-500 uppercase tracking-wider mb-2 ml-1">Search User</label>
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Type a name or email..."
                            value={searchQuery}
                            onChange={e => { setSearchQuery(e.target.value); setSelectedUserId(""); }}
                            className="w-full bg-slate-50 border border-slate-200/80 text-slate-700 text-sm rounded-xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/40 focus:bg-white block p-3.5 shadow-sm outline-none transition-all duration-300 placeholder:text-slate-400 font-medium"
                        />
                        {showDropdown && (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 max-h-48 overflow-y-auto">
                                {filteredUsers.slice(0, 8).map(u => (
                                    <button
                                        key={u.id}
                                        type="button"
                                        onClick={() => handleSelectUser(u)}
                                        className="w-full text-left px-4 py-2.5 hover:bg-slate-50 transition-colors flex items-center gap-3"
                                    >
                                        <div className="h-7 w-7 rounded-lg bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600">
                                            {u.full_name.substring(0, 2).toUpperCase()}
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-slate-800">{u.full_name}</p>
                                            <p className="text-xs text-slate-500">{u.email}</p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
                <div className="md:w-72 w-full relative">
                    <label className="block text-[0.8rem] font-bold text-slate-500 uppercase tracking-wider mb-2 ml-1">Assign Role</label>
                    <select
                        value={selectedRole}
                        onChange={e => setSelectedRole(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200/80 text-slate-700 text-sm rounded-xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/40 focus:bg-white block p-3.5 appearance-none shadow-sm cursor-pointer outline-none transition-all duration-300 font-medium"
                    >
                        <option value="" disabled>Select access level</option>
                        <option value="manager">Manager (Full Access)</option>
                        <option value="engineer">Engineer (Field Work)</option>
                    </select>
                </div>
                <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleSave}
                    disabled={loading}
                    className="bg-gradient-to-r from-blue-600 to-indigo-600 shadow-blue-500/25 shadow-lg hover:shadow-indigo-500/30 hover:from-blue-700 hover:to-indigo-700 text-white w-full md:w-auto px-7 py-3.5 rounded-xl flex items-center justify-center gap-2 font-bold transition-all min-h-[44px] border border-white/10 disabled:opacity-60"
                >
                    <ShieldAlert size={18} className="text-white/80" />
                    {loading ? "Saving..." : "Save Configuration"}
                </motion.button>
            </motion.div>

            {/* Users Table / List */}
            {isMobile ? (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2, duration: 0.5 }}
                    className="space-y-4"
                >
                    {users.map((user, idx) => (
                        <motion.div
                            key={user.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.3 + (idx * 0.05) }}
                            className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5"
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3 cursor-pointer" onClick={() => handleSelectUser(user)}>
                                    <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-slate-100 to-slate-200 border border-slate-300/50 flex items-center justify-center text-xs font-bold text-slate-600 shadow-sm">
                                        {user.full_name.substring(0, 2).toUpperCase()}
                                    </div>
                                    <div>
                                        <span className="font-bold text-slate-800 text-sm">{user.full_name}</span>
                                        <p className="text-slate-500 font-medium text-xs">{user.email}</p>
                                    </div>
                                </div>
                                {user.role && (
                                    <button onClick={() => handleRemoveRole(user.id)} className="text-slate-400 hover:text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors">
                                        <Trash2 size={16} />
                                    </button>
                                )}
                            </div>
                            <div className="mt-4">
                                {user.role ? (
                                    <Badge
                                        variant="secondary"
                                        className={user.role === 'manager'
                                            ? "bg-indigo-50/80 text-indigo-700 border border-indigo-200/60 rounded-lg font-bold px-2.5 py-0.5 shadow-sm capitalize text-[10px] tracking-wider"
                                            : "bg-blue-50/80 text-blue-700 border border-blue-200/60 rounded-lg font-bold px-2.5 py-0.5 shadow-sm capitalize text-[10px] tracking-wider"
                                        }
                                    >
                                        {user.role}
                                    </Badge>
                                ) : (
                                    <span className="text-slate-400/80 font-medium text-xs italic">No roles configured</span>
                                )}
                            </div>
                        </motion.div>
                    ))}
                </motion.div>
            ) : (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2, duration: 0.5 }}
                    className="bg-white rounded-3xl border border-slate-200/80 shadow-[0_4px_20px_rgb(0,0,0,0.03)] overflow-hidden"
                >
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-slate-500 font-semibold text-[0.8rem] uppercase tracking-wider border-b border-slate-100 bg-slate-50/50">
                                <tr>
                                    <th className="px-8 py-5 whitespace-nowrap w-[30%]">Team Member</th>
                                    <th className="px-8 py-5 w-[30%]">Email Address</th>
                                    <th className="px-8 py-5 w-[25%]">Active Role</th>
                                    <th className="px-8 py-5 whitespace-nowrap text-right w-[15%]">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {users.map((user, idx) => (
                                    <motion.tr
                                        key={user.id}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: 0.3 + (idx * 0.05) }}
                                        className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                                        onClick={() => handleSelectUser(user)}
                                    >
                                        <td className="px-8 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-slate-100 to-slate-200 border border-slate-300/50 flex items-center justify-center text-xs font-bold text-slate-600 shadow-sm">
                                                    {user.full_name.substring(0, 2).toUpperCase()}
                                                </div>
                                                <span className="font-bold text-slate-800">{user.full_name}</span>
                                            </div>
                                        </td>
                                        <td className="px-8 py-4 text-slate-500 font-medium">{user.email}</td>
                                        <td className="px-8 py-4">
                                            {user.role ? (
                                                <Badge
                                                    variant="secondary"
                                                    className={user.role === 'manager'
                                                        ? "bg-indigo-50/80 text-indigo-700 border border-indigo-200/60 rounded-lg font-bold px-3 py-1 shadow-sm capitalize text-[10px] tracking-wider"
                                                        : "bg-blue-50/80 text-blue-700 border border-blue-200/60 rounded-lg font-bold px-3 py-1 shadow-sm capitalize text-[10px] tracking-wider"
                                                    }
                                                >
                                                    {user.role}
                                                </Badge>
                                            ) : (
                                                <span className="text-slate-400/80 font-medium text-xs italic">No role assigned</span>
                                            )}
                                        </td>
                                        <td className="px-8 py-4 text-right">
                                            {user.role && (
                                                <button
                                                    onClick={e => { e.stopPropagation(); handleRemoveRole(user.id); }}
                                                    className="text-slate-400 hover:text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors inline-block ml-auto opacity-0 group-hover:opacity-100"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            )}
                                        </td>
                                    </motion.tr>
                                ))}
                                {users.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="px-8 py-10 text-center text-slate-400 font-medium text-sm">
                                            No users found. Users will appear here after they sign up.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </motion.div>
            )}
        </motion.div>
    );
};

export default UserManagement;
