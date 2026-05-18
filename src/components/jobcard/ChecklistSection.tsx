import { motion } from "framer-motion";
import { ClipboardCheck, CheckCircle2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChecklistItem, CheckStatus } from "@/types/jobCard";
import { useIsMobile } from "@/hooks/use-mobile";

interface Props {
  title: string;
  items: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
  delay?: number;
}

const statusOptions: { value: CheckStatus; label: string; color: string }[] = [
  { value: "done", label: "✓ Done", color: "text-success" },
  { value: "pending", label: "⏳ Pending", color: "text-warning" },
  { value: "na", label: "— N/A", color: "text-muted-foreground" },
];

const ChecklistSection = ({ title, items, onChange, delay = 0.2 }: Props) => {
  const isMobile = useIsMobile();

  const updateStatus = (id: number, status: CheckStatus) => {
    onChange(items.map((item) => (item.id === id ? { ...item, status } : item)));
  };

  const markAllDone = () => {
    onChange(items.map((item) => ({ ...item, status: "done" as CheckStatus })));
  };

  const counts = {
    done: items.filter((i) => i.status === "done").length,
    pending: items.filter((i) => i.status === "pending").length,
    na: items.filter((i) => i.status === "na").length,
  };

  const total = items.length;
  const progressPct = total > 0 ? Math.round((counts.done / total) * 100) : 0;
  const allDone = counts.done === total;

  return (
    <div className="section-card">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h2 className="section-title mb-0">
          <span className="section-title-icon">
            {allDone ? (
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 400 }}>
                <CheckCircle2 className="h-4 w-4 text-primary-foreground" />
              </motion.div>
            ) : (
              <ClipboardCheck className="h-4 w-4 text-primary-foreground" />
            )}
          </span>
          {title}
        </h2>
        <div className="flex items-center gap-3">
          <div className="flex gap-2">
            <motion.span className="status-badge-done" whileHover={{ scale: 1.1 }}>{counts.done}</motion.span>
            <motion.span className="status-badge-pending" whileHover={{ scale: 1.1 }}>{counts.pending}</motion.span>
            <motion.span className="status-badge-na" whileHover={{ scale: 1.1 }}>{counts.na}</motion.span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ background: allDone ? "var(--gradient-success)" : "var(--gradient-primary)" }}
                initial={{ width: 0 }}
                animate={{ width: `${progressPct}%` }}
                transition={{ duration: 0.8, delay: delay + 0.3, ease: "easeOut" }}
              />
            </div>
            <motion.span
              key={progressPct}
              className="text-[0.65rem] font-bold text-muted-foreground min-w-[2rem]"
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {progressPct}%
            </motion.span>
          </div>
          {!allDone && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={markAllDone}
              className="text-[0.6rem] font-bold text-primary hover:text-primary/80 uppercase tracking-wider transition-colors hidden sm:block"
            >
              Mark All
            </motion.button>
          )}
        </div>
      </div>

      {isMobile ? (
        <div className="space-y-2">
          {items.map((item, idx) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: delay + idx * 0.02 }}
              className={`p-3 rounded-lg border flex items-center gap-3 ${item.status === 'done' ? 'bg-success/5 border-success/20' : 'bg-background border-border/60'}`}
            >
              <div className="text-muted-foreground text-xs font-mono">{String(item.id).padStart(2, '0')}</div>
              <div className={`flex-1 text-sm transition-all duration-300 ${item.status === 'done' ? 'text-muted-foreground line-through' : ''}`}>
                {item.description}
              </div>
              <div className="w-32">
                <Select value={item.status} onValueChange={(v) => updateStatus(item.id, v as CheckStatus)}>
                  <SelectTrigger className={`h-8 text-xs rounded-lg border-border/60 transition-all duration-300 ${
                    item.status === 'done' ? 'border-success/30 bg-success/10' :
                    item.status === 'pending' ? 'border-warning/30 bg-warning/10' : 'bg-background'
                  }`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border/60">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40">
                <th className="text-left py-3 px-4 text-[0.65rem] uppercase tracking-wider text-muted-foreground font-bold w-12">#</th>
                <th className="text-left py-3 px-4 text-[0.65rem] uppercase tracking-wider text-muted-foreground font-bold">Job Description</th>
                <th className="text-left py-3 px-4 text-[0.65rem] uppercase tracking-wider text-muted-foreground font-bold w-36">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <motion.tr
                  key={item.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: delay + idx * 0.02 }}
                  className={`table-row-interactive ${item.status === 'done' ? 'bg-success/[0.02]' : ''}`}
                >
                  <td className="py-2.5 px-4 text-muted-foreground text-xs font-mono">{String(item.id).padStart(2, '0')}</td>
                  <td className={`py-2.5 px-4 text-sm transition-all duration-300 ${item.status === 'done' ? 'text-muted-foreground line-through' : ''}`}>
                    {item.description}
                  </td>
                  <td className="py-2.5 px-4">
                    <Select value={item.status} onValueChange={(v) => updateStatus(item.id, v as CheckStatus)}>
                      <SelectTrigger className={`h-8 text-xs rounded-lg border-border/60 transition-all duration-300 ${
                        item.status === 'done' ? 'border-success/30 bg-success/[0.05]' :
                        item.status === 'pending' ? 'border-warning/30 bg-warning/[0.05]' : ''
                      }`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {statusOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Completion celebration */}
      {allDone && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 300 }}
          className="mt-4 py-3 px-4 rounded-xl text-center text-xs font-bold text-success"
          style={{ background: "hsl(var(--success) / 0.08)" }}
        >
          ✨ All items completed!
        </motion.div>
      )}
    </div>
  );
};

export default ChecklistSection;