import { motion, AnimatePresence } from "framer-motion";
import { Package, Clock, Plus, Trash2, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PartItem, LaborItem } from "@/types/jobCard";
import { sampleParts } from "@/data/defaultChecklist";

interface Props {
  parts: PartItem[];
  labor: LaborItem[];
  onPartsChange: (parts: PartItem[]) => void;
  onLaborChange: (labor: LaborItem[]) => void;
  role?: 'engineer' | 'manager';
}

const rowVariants = {
  initial: { opacity: 0, x: -20, height: 0 },
  animate: { opacity: 1, x: 0, height: "auto", transition: { duration: 0.3 } },
  exit: { opacity: 0, x: 20, height: 0, transition: { duration: 0.2 } },
};

const PartsLaborSection = ({ parts, labor, onPartsChange, onLaborChange, role = 'engineer' }: Props) => {
  const addPart = () => {
    onPartsChange([...parts, { id: crypto.randomUUID(), description: "", qty: 1, unitPrice: 0, totalPrice: 0 }]);
  };

  const updatePart = (id: string, field: keyof PartItem, value: string | number) => {
    onPartsChange(
      parts.map((p) => {
        if (p.id !== id) return p;
        const updated = { ...p, [field]: value };
        if (field === "qty" || field === "unitPrice") {
          updated.totalPrice = Number(updated.qty) * Number(updated.unitPrice);
        }
        return updated;
      })
    );
  };

  const removePart = (id: string) => onPartsChange(parts.filter((p) => p.id !== id));

  const addLabor = () => {
    onLaborChange([...labor, { id: crypto.randomUUID(), description: "", hours: 0, ratePerHour: 0, totalCost: 0 }]);
  };

  const updateLabor = (id: string, field: keyof LaborItem, value: string | number) => {
    onLaborChange(
      labor.map((l) => {
        if (l.id !== id) return l;
        const updated = { ...l, [field]: value };
        if (field === "hours" || field === "ratePerHour") {
          updated.totalCost = Number(updated.hours) * Number(updated.ratePerHour);
        }
        return updated;
      })
    );
  };

  const removeLabor = (id: string) => onLaborChange(labor.filter((l) => l.id !== id));

  const totalPartsValue = parts.reduce((sum, p) => sum + p.totalPrice, 0);
  const totalLaborValue = labor.reduce((sum, l) => sum + l.totalCost, 0);

  return (
    <div className="section-card">
      {/* Parts */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-5">
          <h2 className="section-title mb-0">
            <span className="section-title-icon">
              <Package className="h-4 w-4 text-primary-foreground" />
            </span>
            Parts Used
            {parts.length > 0 && role === 'manager' && (
              <motion.span
                key={parts.length}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="ml-2 text-[0.6rem] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary normal-case tracking-normal"
              >
                {parts.length} item{parts.length > 1 ? 's' : ''} · AED {totalPartsValue.toFixed(2)}
              </motion.span>
            )}
            {parts.length > 0 && role === 'engineer' && (
              <motion.span
                key={`eng-${parts.length}`}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="ml-2 text-[0.6rem] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary normal-case tracking-normal"
              >
                {parts.length} item{parts.length > 1 ? 's' : ''}
              </motion.span>
            )}
          </h2>
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button size="sm" onClick={addPart} className="gap-1.5 btn-primary-gradient border-0 rounded-xl px-4 text-xs font-bold">
              <Plus className="h-3.5 w-3.5" /> Add Part
            </Button>
          </motion.div>
        </div>

        <AnimatePresence mode="popLayout">
          {parts.length > 0 ? (
            <motion.div layout className="overflow-x-auto rounded-xl border border-border/60">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40">
                    <th className="text-left py-3 px-4 text-[0.65rem] uppercase tracking-wider text-muted-foreground font-bold">Part Description</th>
                    <th className="text-left py-3 px-4 text-[0.65rem] uppercase tracking-wider text-muted-foreground font-bold w-20">Qty</th>
                    {role === 'manager' && (
                      <>
                        <th className="text-left py-3 px-4 text-[0.65rem] uppercase tracking-wider text-muted-foreground font-bold w-28">Unit Price</th>
                        <th className="text-left py-3 px-4 text-[0.65rem] uppercase tracking-wider text-muted-foreground font-bold w-28">Total</th>
                      </>
                    )}
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence>
                    {parts.map((part) => (
                      <motion.tr
                        key={part.id}
                        variants={rowVariants}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        layout
                        className="table-row-interactive"
                      >
                        <td className="py-2.5 px-4">
                          <Select value={part.description} onValueChange={(v) => updatePart(part.id, "description", v)}>
                            <SelectTrigger className="h-9 text-xs rounded-lg border-border/60">
                              <SelectValue placeholder="Select part" />
                            </SelectTrigger>
                            <SelectContent>
                              {sampleParts.map((p) => (
                                <SelectItem key={p} value={p}>{p}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="py-2.5 px-4">
                          <Input className="h-9 text-xs rounded-lg border-border/60" type="number" min={1} value={part.qty} onChange={(e) => updatePart(part.id, "qty", Number(e.target.value))} />
                        </td>
                        {role === 'manager' && (
                          <>
                            <td className="py-2.5 px-4">
                              <Input className="h-9 text-xs rounded-lg border-border/60" type="number" min={0} step={0.01} value={part.unitPrice} onChange={(e) => updatePart(part.id, "unitPrice", Number(e.target.value))} />
                            </td>
                            <td className="py-2.5 px-4">
                              <motion.span
                                key={part.totalPrice}
                                initial={{ scale: 1.2, color: "hsl(var(--primary))" }}
                                animate={{ scale: 1, color: "hsl(var(--foreground))" }}
                                className="font-bold text-sm"
                              >
                                AED {part.totalPrice.toFixed(2)}
                              </motion.span>
                            </td>
                          </>
                        )}
                        <td className="py-2.5 px-4">
                          <motion.div whileHover={{ scale: 1.2 }} whileTap={{ scale: 0.8 }}>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10 rounded-lg" onClick={() => removePart(part.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </motion.div>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="empty-state cursor-pointer group"
              onClick={addPart}
            >
              <motion.div animate={{ y: [0, -4, 0] }} transition={{ duration: 2, repeat: Infinity }}>
                <Package className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3 group-hover:text-primary/40 transition-colors" />
              </motion.div>
              <p className="text-xs text-muted-foreground font-medium">No parts added yet</p>
              <p className="text-[0.65rem] text-muted-foreground/60 mt-1">Click to add your first part</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Labor */}
      <div>
        <div className="flex items-center justify-between mb-5">
          <h2 className="section-title mb-0">
            <span className="section-title-icon">
              <Clock className="h-4 w-4 text-primary-foreground" />
            </span>
            Labor
            {labor.length > 0 && role === 'manager' && (
              <motion.span
                key={labor.length}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="ml-2 text-[0.6rem] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary normal-case tracking-normal"
              >
                {labor.length} entr{labor.length > 1 ? 'ies' : 'y'} · AED {totalLaborValue.toFixed(2)}
              </motion.span>
            )}
            {labor.length > 0 && role === 'engineer' && (
              <motion.span
                key={`eng-lab-${labor.length}`}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="ml-2 text-[0.6rem] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary normal-case tracking-normal"
              >
                {labor.length} entr{labor.length > 1 ? 'ies' : 'y'}
              </motion.span>
            )}
          </h2>
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button size="sm" onClick={addLabor} className="gap-1.5 btn-primary-gradient border-0 rounded-xl px-4 text-xs font-bold">
              <Plus className="h-3.5 w-3.5" /> Add Labor
            </Button>
          </motion.div>
        </div>

        <AnimatePresence mode="popLayout">
          {labor.length > 0 ? (
            <motion.div layout className="overflow-x-auto rounded-xl border border-border/60">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40">
                    <th className="text-left py-3 px-4 text-[0.65rem] uppercase tracking-wider text-muted-foreground font-bold">Description</th>
                    <th className="text-left py-3 px-4 text-[0.65rem] uppercase tracking-wider text-muted-foreground font-bold w-20">Hours</th>
                    {role === 'manager' && (
                      <>
                        <th className="text-left py-3 px-4 text-[0.65rem] uppercase tracking-wider text-muted-foreground font-bold w-28">Rate/Hr</th>
                        <th className="text-left py-3 px-4 text-[0.65rem] uppercase tracking-wider text-muted-foreground font-bold w-28">Total</th>
                      </>
                    )}
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence>
                    {labor.map((item) => (
                      <motion.tr
                        key={item.id}
                        variants={rowVariants}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        layout
                        className="table-row-interactive"
                      >
                        <td className="py-2.5 px-4">
                          <Input className="h-9 text-xs rounded-lg border-border/60" placeholder="Labor description" value={item.description} onChange={(e) => updateLabor(item.id, "description", e.target.value)} />
                        </td>
                        <td className="py-2.5 px-4">
                          <Input className="h-9 text-xs rounded-lg border-border/60" type="number" min={0} step={0.5} value={item.hours} onChange={(e) => updateLabor(item.id, "hours", Number(e.target.value))} />
                        </td>
                        {role === 'manager' && (
                          <>
                            <td className="py-2.5 px-4">
                              <Input className="h-9 text-xs rounded-lg border-border/60" type="number" min={0} step={0.01} value={item.ratePerHour} onChange={(e) => updateLabor(item.id, "ratePerHour", Number(e.target.value))} />
                            </td>
                            <td className="py-2.5 px-4">
                              <motion.span
                                key={item.totalCost}
                                initial={{ scale: 1.2, color: "hsl(var(--primary))" }}
                                animate={{ scale: 1, color: "hsl(var(--foreground))" }}
                                className="font-bold text-sm"
                              >
                                AED {item.totalCost.toFixed(2)}
                              </motion.span>
                            </td>
                          </>
                        )}
                        <td className="py-2.5 px-4">
                          <motion.div whileHover={{ scale: 1.2 }} whileTap={{ scale: 0.8 }}>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10 rounded-lg" onClick={() => removeLabor(item.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </motion.div>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="empty-state cursor-pointer group"
              onClick={addLabor}
            >
              <motion.div animate={{ y: [0, -4, 0] }} transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}>
                <Clock className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3 group-hover:text-primary/40 transition-colors" />
              </motion.div>
              <p className="text-xs text-muted-foreground font-medium">No labor entries added yet</p>
              <p className="text-[0.65rem] text-muted-foreground/60 mt-1">Click to add your first entry</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default PartsLaborSection;