import React, { useState } from 'react';
import { apiFetch } from "@/lib/api";
import { User, Mail, Phone, Building, Camera, Save, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

const getStoredUser = () => {
    try {
        const raw = localStorage.getItem("user");
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
};

const ProfileSettings = () => {
    const storedUser = getStoredUser();
    const [formData, setFormData] = useState({
        name: storedUser?.fullName || storedUser?.full_name || '',
        email: storedUser?.email || '',
        phone: storedUser?.phone || '',
        department: storedUser?.department || '',
        role: storedUser?.role || '',
    });
    const [saving, setSaving] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!storedUser?.id) {
            toast.error("Not logged in");
            return;
        }
        setSaving(true);
        try {
            const res = await apiFetch(`/users/${storedUser.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fullName: formData.name,
                    phone: formData.phone,
                    department: formData.department,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);
            // Update localStorage with fresh data
            localStorage.setItem("user", JSON.stringify({
                ...storedUser,
                fullName: data.data.fullName,
                phone: data.data.phone,
                department: data.data.department,
            }));
            toast.success("Profile updated successfully");
        } catch (err: any) {
            toast.error(err.message || "Failed to update profile");
        } finally {
            setSaving(false);
        }
    };

    const displayInitials = formData.name ? formData.name.substring(0, 2).toUpperCase() : "??";

    return (
        <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-4xl mx-auto space-y-8"
        >
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white/80 p-4 sm:p-8 rounded-3xl shadow-[0_2px_15px_rgb(0,0,0,0.03)] border border-slate-200/60 backdrop-blur-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl -mr-20 -mt-20" />
                <div className="relative z-10 flex items-center gap-4">
                    <div className="w-12 h-12 bg-slate-800 text-white rounded-2xl flex items-center justify-center shadow-lg">
                        <Settings size={24} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-800 to-slate-600">Profile Settings</h1>
                        <p className="text-sm font-medium text-slate-500">Manage your personal information and preferences</p>
                    </div>
                </div>
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.5 }}
                className="bg-white rounded-3xl shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-slate-200/80 overflow-hidden"
            >
                <div className="p-4 sm:p-8 border-b border-slate-100 bg-slate-50/50">
                    <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-8">
                        <motion.div whileHover={{ scale: 1.05 }} className="relative group cursor-pointer">
                            <div className="h-24 w-24 sm:h-28 sm:w-28 rounded-full bg-gradient-to-tr from-slate-200 to-slate-100 flex items-center justify-center overflow-hidden border-4 border-white shadow-lg ring-1 ring-slate-200">
                                <span className="text-4xl font-extrabold text-slate-400/50">{displayInitials}</span>
                            </div>
                            <div className="absolute inset-0 bg-slate-900/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 backdrop-blur-sm border-4 border-transparent">
                                <Camera className="h-8 w-8 text-white" />
                            </div>
                        </motion.div>
                        <div className="text-center sm:text-left">
                            <h3 className="text-2xl font-extrabold text-slate-800 tracking-tight">{formData.name || "—"}</h3>
                            {formData.role && (
                                <p className="text-blue-600 font-bold uppercase tracking-wider text-xs mt-1 bg-blue-50 px-3 py-1 rounded-lg inline-block capitalize">{formData.role}</p>
                            )}
                        </div>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="p-4 sm:p-8 space-y-6 sm:space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 md:gap-x-8 gap-y-5 sm:gap-y-6">
                        <div className="space-y-2">
                            <label className="text-[0.8rem] font-bold text-slate-500 uppercase tracking-wider ml-1">Full Name</label>
                            <div className="relative group">
                                <User className="absolute left-4 top-3.5 h-5 w-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                                <input
                                    type="text"
                                    name="name"
                                    value={formData.name}
                                    onChange={handleChange}
                                    className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200/80 rounded-xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/40 focus:bg-white transition-all shadow-sm outline-none font-medium text-slate-700"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[0.8rem] font-bold text-slate-500 uppercase tracking-wider ml-1">Email Address</label>
                            <div className="relative group">
                                <Mail className="absolute left-4 top-3.5 h-5 w-5 text-slate-400 transition-colors" />
                                <input
                                    type="email"
                                    name="email"
                                    value={formData.email}
                                    disabled
                                    className="w-full pl-12 pr-4 py-3.5 bg-slate-100 border border-slate-200/80 rounded-xl transition-all shadow-sm outline-none font-medium text-slate-500 cursor-not-allowed"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[0.8rem] font-bold text-slate-500 uppercase tracking-wider ml-1">Phone Number</label>
                            <div className="relative group">
                                <Phone className="absolute left-4 top-3.5 h-5 w-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                                <input
                                    type="tel"
                                    name="phone"
                                    value={formData.phone}
                                    onChange={handleChange}
                                    placeholder="+971-XX-XXXXXXX"
                                    className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200/80 rounded-xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/40 focus:bg-white transition-all shadow-sm outline-none font-medium text-slate-700"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[0.8rem] font-bold text-slate-500 uppercase tracking-wider ml-1">Department</label>
                            <div className="relative group">
                                <Building className="absolute left-4 top-3.5 h-5 w-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                                <input
                                    type="text"
                                    name="department"
                                    value={formData.department}
                                    onChange={handleChange}
                                    placeholder="e.g. Field Service Operations"
                                    className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200/80 rounded-xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/40 focus:bg-white transition-all shadow-sm outline-none font-medium text-slate-700"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="pt-5 sm:pt-8 flex justify-end border-t border-slate-100">
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            type="submit"
                            disabled={saving}
                            className="bg-slate-800 hover:bg-slate-900 text-white px-6 sm:px-8 py-3 sm:py-3.5 rounded-xl flex items-center gap-2 font-bold transition-all shadow-lg shadow-slate-800/20 cursor-pointer min-h-[44px] disabled:opacity-60"
                        >
                            <Save className="h-5 w-5" />
                            {saving ? "Saving..." : "Save Changes"}
                        </motion.button>
                    </div>
                </form>
            </motion.div>
        </motion.div>
    );
};

export default ProfileSettings;
