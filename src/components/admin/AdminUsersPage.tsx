import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit3, Key, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";

// The API returns errors as { error: { code, message, details } }, so the
// message has to be unwrapped — passing the object to Error() yields
// "[object Object]" in the toast.
const errorMessage = (payload: unknown, fallback: string) => {
  const err = (payload as { error?: unknown })?.error;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && typeof (err as { message?: unknown }).message === "string") {
    return (err as { message: string }).message;
  }
  return fallback;
};

interface UserRecord {
  id: number;
  full_name: string;
  email: string;
  role: "engineer" | "manager" | "admin";
  is_active: boolean;
}

interface AuditEntry {
  id: number;
  user_id: number | null;
  user_name: string | null;
  user_role: string | null;
  action_type: string;
  entity_type: string | null;
  entity_id: number | null;
  endpoint: string | null;
  method: string | null;
  ip_address: string | null;
  created_at: string;
}

const roleOptions: Array<{ value: UserRecord["role"]; label: string }> = [
  { value: "engineer", label: "Engineer" },
  { value: "manager", label: "Manager" },
  { value: "admin", label: "Administrator" },
];

const AdminUsersPage = () => {
  const isMobile = useIsMobile();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserRecord | null>(null);
  const [form, setForm] = useState({ name: "", email: "", role: "engineer" as UserRecord["role"], password: "" });
  const [newPassword, setNewPassword] = useState("");

  const filteredUsers = useMemo(
    () => users.filter((user) =>
      `${user.full_name} ${user.email}`.toLowerCase().includes(search.toLowerCase())
    ),
    [users, search]
  );

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/admin/users");
      if (!res.ok) throw new Error("Failed to load users");
      const data = await res.json();
      setUsers(Array.isArray(data.data) ? data.data : []);
    } catch (error) {
      console.error(error);
      toast.error("Unable to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAuditLog = useCallback(async () => {
    setAuditLoading(true);
    try {
      const res = await apiFetch("/api/admin/audit-log?limit=10");
      if (!res.ok) throw new Error("Failed to load audit log");
      const data = await res.json();
      setAuditLog(Array.isArray(data.data) ? data.data : []);
    } catch (error) {
      console.error(error);
      toast.error("Unable to load audit log");
    } finally {
      setAuditLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchAuditLog();
  }, [fetchUsers, fetchAuditLog]);

  const openCreateDialog = () => {
    setForm({ name: "", email: "", role: "engineer", password: "" });
    setShowCreate(true);
  };

  const openEditDialog = (user: UserRecord) => {
    setSelectedUser(user);
    setForm({ name: user.full_name, email: user.email, role: user.role, password: "" });
    setShowEdit(true);
  };

  const openPasswordDialog = (user: UserRecord) => {
    setSelectedUser(user);
    setNewPassword("");
    setShowPassword(true);
  };

  const handleCreateUser = async () => {
    if (!form.name || !form.email || !form.password) {
      toast.error("Please complete all fields before creating a user.");
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(errorMessage(payload, "Unable to create user"));
      toast.success("User created successfully.");
      setShowCreate(false);
      await fetchUsers();
      await fetchAuditLog();
    } catch (error) {
      console.error(error);
      toast.error(String((error as Error).message || "Failed to create user"));
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateUser = async () => {
    if (!selectedUser) return;
    if (!form.name && !form.email && !form.role) {
      toast.error("Please provide at least one field to update.");
      return;
    }
    setLoading(true);
    try {
      const body = { name: form.name, email: form.email, role: form.role };
      const res = await apiFetch(`/api/admin/users/${selectedUser.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(errorMessage(payload, "Unable to update user"));
      toast.success("User profile updated.");
      setShowEdit(false);
      await fetchUsers();
      await fetchAuditLog();
    } catch (error) {
      console.error(error);
      toast.error(String((error as Error).message || "Failed to update user"));
    } finally {
      setLoading(false);
    }
  };

  const handleSetPassword = async () => {
    if (!selectedUser || !newPassword) {
      toast.error("Enter a new password before saving.");
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch(`/api/admin/users/${selectedUser.id}/password`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(errorMessage(payload, "Unable to update password"));
      toast.success("Password updated successfully.");
      setShowPassword(false);
      await fetchAuditLog();
    } catch (error) {
      console.error(error);
      toast.error(String((error as Error).message || "Failed to update password"));
    } finally {
      setLoading(false);
    }
  };

  const toggleUserActive = async (user: UserRecord) => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/admin/users/${user.id}/toggle-active`, {
        method: "PUT",
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(errorMessage(payload, "Unable to update user status"));
      toast.success(payload.message || "User status updated.");
      await fetchUsers();
      await fetchAuditLog();
    } catch (error) {
      console.error(error);
      toast.error(String((error as Error).message || "Failed to update status"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.25em] text-primary">Admin</p>
            <h1 className="text-3xl font-semibold tracking-tight">User management</h1>
            <p className="mt-2 text-sm text-slate-500">Create, edit, and manage active users with admin privileges.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name or email"
              className="w-full sm:w-80"
            />
            <Button onClick={openCreateDialog} className="rounded-2xl px-5" size="lg">
              <Plus className="h-4 w-4" />
              Add user
            </Button>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200/70 bg-white p-4 shadow-sm sm:p-6">
          {isMobile ? (
            <div className="space-y-4">
              {filteredUsers.map((user) => (
                <motion.div
                  key={user.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-3xl border border-border/80 bg-slate-50 p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-slate-900">{user.full_name}</p>
                      <p className="text-sm text-slate-500">{user.email}</p>
                    </div>
                    <Badge variant={user.is_active ? "secondary" : "outline"} className="text-xs uppercase tracking-[0.2em]">
                      {user.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2 text-sm text-slate-600">
                    <span className="rounded-full border border-slate-200 px-3 py-1">{user.role}</span>
                    <span className="rounded-full border border-slate-200 px-3 py-1">ID {user.id}</span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEditDialog(user)}>
                      <Edit3 className="h-4 w-4" /> Edit
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openPasswordDialog(user)}>
                      <Key className="h-4 w-4" /> Password
                    </Button>
                    <Button size="sm" variant={user.is_active ? "destructive" : "secondary"} onClick={() => toggleUserActive(user)}>
                      {user.is_active ? "Disable" : "Enable"}
                    </Button>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-slate-700">Name</th>
                    <th className="px-4 py-3 font-semibold text-slate-700">Email</th>
                    <th className="px-4 py-3 font-semibold text-slate-700">Role</th>
                    <th className="px-4 py-3 font-semibold text-slate-700">Status</th>
                    <th className="px-4 py-3 font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="transition-colors hover:bg-slate-50">
                      <td className="px-4 py-4 font-medium text-slate-900">{user.full_name}</td>
                      <td className="px-4 py-4 text-slate-600">{user.email}</td>
                      <td className="px-4 py-4 text-slate-600">{user.role}</td>
                      <td className="px-4 py-4">
                        <Badge variant={user.is_active ? "secondary" : "outline"} className="text-xs uppercase tracking-[0.2em]">
                          {user.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="px-4 py-4 space-x-2">
                        <Button size="sm" variant="outline" onClick={() => openEditDialog(user)}>
                          <Edit3 className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openPasswordDialog(user)}>
                          <Key className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant={user.is_active ? "destructive" : "secondary"} onClick={() => toggleUserActive(user)}>
                          {user.is_active ? <XCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-slate-200/70 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-4">
            <div>
              <p className="text-sm uppercase tracking-[0.25em] text-primary">Activity</p>
              <h2 className="text-xl font-semibold">Recent admin actions</h2>
            </div>
            <Button size="sm" variant="outline" onClick={fetchAuditLog} disabled={auditLoading}>
              {auditLoading ? "Refreshing..." : "Refresh log"}
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-3 font-semibold text-slate-700">When</th>
                  <th className="px-3 py-3 font-semibold text-slate-700">Action</th>
                  <th className="px-3 py-3 font-semibold text-slate-700">Target</th>
                  <th className="px-3 py-3 font-semibold text-slate-700">Performed by</th>
                  <th className="px-3 py-3 font-semibold text-slate-700">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {auditLog.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-5 text-sm text-slate-500 text-center">
                      No recent admin actions to display.
                    </td>
                  </tr>
                ) : (
                  auditLog.map((entry) => (
                    <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-4 text-slate-700">
                        {new Date(entry.created_at).toLocaleString()}
                      </td>
                      <td className="px-3 py-4 text-slate-700 font-medium">{entry.action_type}</td>
                      <td className="px-3 py-4 text-slate-600">
                        {entry.entity_type || "System"}
                        {entry.entity_id ? ` #${entry.entity_id}` : ""}
                      </td>
                      <td className="px-3 py-4 text-slate-600">{entry.user_name || "Unknown"} ({entry.user_role || "-"})</td>
                      <td className="px-3 py-4 text-slate-500 truncate max-w-[260px]">
                        {entry.endpoint || "-"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create new user</DialogTitle>
            <DialogDescription>Provide name, email, role, and password for a new account.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Input placeholder="Full name" value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
            <Input placeholder="Email address" type="email" value={form.email} onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))} />
            <Select value={form.role} onValueChange={(value) => setForm((prev) => ({ ...prev, role: value as UserRecord["role"] }))}>
              <SelectTrigger>
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                {roleOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input placeholder="Password" type="password" value={form.password} onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreateUser}>Create user</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEdit} onOpenChange={(open) => { if (!open) setSelectedUser(null); setShowEdit(open); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit user</DialogTitle>
            <DialogDescription>Update profile details for this account.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Input placeholder="Full name" value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
            <Input placeholder="Email address" type="email" value={form.email} onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))} />
            <Select value={form.role} onValueChange={(value) => setForm((prev) => ({ ...prev, role: value as UserRecord["role"] }))}>
              <SelectTrigger>
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                {roleOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEdit(false)}>Cancel</Button>
            <Button onClick={handleUpdateUser}>Save changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showPassword} onOpenChange={(open) => { if (!open) setSelectedUser(null); setShowPassword(open); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>Set a new password for this user account.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Input placeholder="New password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPassword(false)}>Cancel</Button>
            <Button onClick={handleSetPassword}>Update password</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminUsersPage;
