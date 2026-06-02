import { motion, AnimatePresence } from "framer-motion";
import { Package, Clock, Plus, Trash2, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PartItem, LaborItem } from "@/types/jobCard";
import { sampleParts } from "@/data/defaultChecklist";
import { useIsMobile } from "@/hooks/use-mobile";

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
  const isMobile = useIsMobile();

  const addPart = () => {
    onPartsChange([...parts, { id: crypto.randomUUID(), description: "", qty: 1, unitPrice: 0, totalPrice: 0 }]);
  };

  const updatePart = (id: string, field: keyof PartItem, value: string | number) => {
    onPartsChange(
      parts.map((p) => {
        if (p.id !== id) return p;
        const updated = { ...p, [field]: value };
        if (field === "qty" || field === "unitPrice") {
          updated.totalPrice = Number(updated.qty || 0) * Number(updated.unitPrice || 0);
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
          updated.totalCost = Number(updated.hours || 0) * Number(updated.ratePerHour || 0);
        }
        return updated;
      })
    );
  };

  const removeLabor = (id: string) => onLaborChange(labor.filter((l) => l.id !== id));

  const totalPartsValue = parts.reduce((sum, p) => sum + (Number(p.totalPrice) || 0), 0);
  const totalLaborValue = labor.reduce((sum, l) => sum + (Number(l.totalCost) || 0), 0);

  const unpricedParts = parts.filter(p => !Number(p.unitPrice)).length;
  const unpricedLabor = labor.filter(l => !Number(l.ratePerHour)).length;
  const needsPricing = role === 'manager' && ((parts.length > 0 && unpricedParts > 0) || (labor.length > 0 && unpricedLabor > 0));

  const priceInputClass = (val: number | string) =>
    `h-10 text-sm font-bold text-black bg-white border-2 rounded-lg ${
      !Number(val) ? 'border-amber-400 bg-amber-50' : 'border-slate-400'
    }`;

  return (
    <div className="section-card">
      <datalist id="parts-list">
        {sampleParts.map(part => (
          <option key={part} value={part} />
        ))}
      </datalist>

      {/* Pricing reminder banner */}
      {needsPricing && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-5 flex items-start gap-3 bg-amber-50 border border-amber-300 rounded-xl px-4 py-3"
        >
          <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-amber-800">Prices Missing</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Fill in the highlighted <strong>Unit Price</strong> / <strong>Rate/Hr</strong> fields below before saving.
            </p>
          </div>
        </motion.div>
      )}

      {/* ── Parts ── */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-5">
          <h2 className="section-title mb-0">
            <span className="section-title-icon">
              <Package className="h-4 w-4 text-primary-foreground" />
            </span>
            Parts Used
            {parts.length > 0 && (
              <motion.span
                key={parts.length}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="ml-2 text-[0.65rem] font-black px-2.5 py-1 rounded-full bg-slate-200 text-black normal-case tracking-normal shadow-sm"
              >
                {parts.length} item{parts.length > 1 ? 's' : ''}{totalPartsValue > 0 ? ` · AED ${totalPartsValue.toFixed(2)}` : ''}
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
            isMobile ? (
              <div className="space-y-4">
                <AnimatePresence>
                  {parts.map((part) => (
                    <motion.div
                      key={part.id}
                      variants={rowVariants}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      layout
                      className="bg-card p-4 rounded-xl border border-border/60 shadow-sm relative"
                    >
                      <Button
                        variant="ghost" size="icon"
                        className="absolute right-2 top-2 h-8 w-8 text-destructive hover:bg-destructive/10 rounded-lg"
                        onClick={() => removePart(part.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <div className="grid gap-3 pt-2">
                        <div>
                          <label className="text-xs uppercase tracking-wider text-black font-black mb-1 block">Part Description</label>
                          <Input list="parts-list" className="h-10 text-sm font-bold text-black bg-white border-slate-400 border-2 rounded-lg" placeholder="Part description" value={part.description} onChange={(e) => updatePart(part.id, "description", e.target.value)} />
                        </div>
                        <div>
                          <label className="text-xs uppercase tracking-wider text-black font-black mb-1 block">Part Number</label>
                          <Input className="h-10 text-sm font-bold text-black bg-white border-slate-400 border-2 rounded-lg" placeholder="Part number" value={part.partNumber || ""} onChange={(e) => updatePart(part.id, "partNumber", e.target.value)} />
                        </div>
                        <div className={`grid gap-3 ${role === 'manager' ? 'grid-cols-3' : 'grid-cols-1'}`}>
                          <div>
                            <label className="text-xs uppercase tracking-wider text-black font-black mb-1 block">Qty</label>
                            <Input className="h-10 text-sm font-bold text-black bg-white border-slate-400 border-2 rounded-lg" type="number" min={1} value={part.qty} onChange={(e) => updatePart(part.id, "qty", e.target.value === "" ? "" : Number(e.target.value))} />
                          </div>
                          {role === 'manager' && (
                            <>
                              <div>
                                <label className="text-xs uppercase tracking-wider text-black font-black mb-1 block">Unit Price</label>
                                <Input className={priceInputClass(part.unitPrice)} type="number" min={0} step={0.01} placeholder="0.00" value={part.unitPrice || ""} onChange={(e) => updatePart(part.id, "unitPrice", e.target.value === "" ? 0 : Number(e.target.value))} />
                              </div>
                              <div>
                                <label className="text-xs uppercase tracking-wider text-black font-black mb-1 block">Total</label>
                                <div className="h-10 flex items-center text-sm font-black text-black">AED {(Number(part.totalPrice) || 0).toFixed(2)}</div>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            ) : (
              <motion.div layout className="overflow-x-auto rounded-xl border border-border/60">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/40">
                      <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-black font-black">Part Description</th>
                      <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-black font-black w-32">Part Number</th>
                      <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-black font-black w-20">Qty</th>
                      {role === 'manager' && (
                        <>
                          <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-black font-black w-36">Unit Price (AED)</th>
                          <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-black font-black w-28">Total</th>
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
                            <Input list="parts-list" className="h-10 text-sm font-bold text-black bg-white border-slate-400 border-2 rounded-lg" placeholder="Part description" value={part.description} onChange={(e) => updatePart(part.id, "description", e.target.value)} />
                          </td>
                          <td className="py-2.5 px-4">
                            <Input className="h-10 text-sm font-bold text-black bg-white border-slate-400 border-2 rounded-lg" placeholder="Part number" value={part.partNumber || ""} onChange={(e) => updatePart(part.id, "partNumber", e.target.value)} />
                          </td>
                          <td className="py-2.5 px-4">
                            <Input className="h-10 text-sm font-bold text-black bg-white border-slate-400 border-2 rounded-lg" type="number" min={1} value={part.qty} onChange={(e) => updatePart(part.id, "qty", e.target.value === "" ? "" : Number(e.target.value))} />
                          </td>
                          {role === 'manager' && (
                            <>
                              <td className="py-2.5 px-4">
                                <Input
                                  className={priceInputClass(part.unitPrice)}
                                  type="number" min={0} step={0.01}
                                  placeholder="Enter price"
                                  value={part.unitPrice || ""}
                                  onChange={(e) => updatePart(part.id, "unitPrice", e.target.value === "" ? 0 : Number(e.target.value))}
                                />
                              </td>
                              <td className="py-2.5 px-4">
                                <span className="font-black text-sm text-black">AED {(Number(part.totalPrice) || 0).toFixed(2)}</span>
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
            )
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

      {/* ── Labor ── */}
      <div>
        <div className="flex items-center justify-between mb-5">
          <h2 className="section-title mb-0">
            <span className="section-title-icon">
              <Clock className="h-4 w-4 text-primary-foreground" />
            </span>
            Labor
            {labor.length > 0 && (
              <motion.span
                key={labor.length}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="ml-2 text-[0.65rem] font-black px-2.5 py-1 rounded-full bg-slate-200 text-black normal-case tracking-normal shadow-sm"
              >
                {labor.length} entr{labor.length > 1 ? 'ies' : 'y'}{totalLaborValue > 0 ? ` · AED ${totalLaborValue.toFixed(2)}` : ''}
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
            isMobile ? (
              <div className="space-y-4">
                <AnimatePresence>
                  {labor.map((item) => (
                    <motion.div
                      key={item.id}
                      variants={rowVariants}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      layout
                      className="bg-card p-4 rounded-xl border border-border/60 shadow-sm relative"
                    >
                      <Button
                        variant="ghost" size="icon"
                        className="absolute right-2 top-2 h-8 w-8 text-destructive hover:bg-destructive/10 rounded-lg"
                        onClick={() => removeLabor(item.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <div className="grid gap-3 pt-2">
                        <div>
                          <label className="text-xs uppercase tracking-wider text-black font-black mb-1 block">Description</label>
                          <Input className="h-10 text-sm font-bold text-black bg-white border-slate-400 border-2 rounded-lg" placeholder="Labor description" value={item.description} onChange={(e) => updateLabor(item.id, "description", e.target.value)} />
                        </div>
                        <div className={`grid gap-3 ${role === 'manager' ? 'grid-cols-3' : 'grid-cols-1'}`}>
                          <div>
                            <label className="text-xs uppercase tracking-wider text-black font-black mb-1 block">Hours</label>
                            <Input className="h-10 text-sm font-bold text-black bg-white border-slate-400 border-2 rounded-lg" type="number" min={0} step={0.5} value={item.hours} onChange={(e) => updateLabor(item.id, "hours", e.target.value === "" ? "" : Number(e.target.value))} />
                          </div>
                          {role === 'manager' && (
                            <>
                              <div>
                                <label className="text-xs uppercase tracking-wider text-black font-black mb-1 block">Rate/Hr</label>
                                <Input className={priceInputClass(item.ratePerHour)} type="number" min={0} step={0.01} placeholder="0.00" value={item.ratePerHour || ""} onChange={(e) => updateLabor(item.id, "ratePerHour", e.target.value === "" ? 0 : Number(e.target.value))} />
                              </div>
                              <div>
                                <label className="text-xs uppercase tracking-wider text-black font-black mb-1 block">Total</label>
                                <div className="h-10 flex items-center text-sm font-black text-black">AED {(Number(item.totalCost) || 0).toFixed(2)}</div>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            ) : (
              <motion.div layout className="overflow-x-auto rounded-xl border border-border/60">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/40">
                      <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-black font-black">Description</th>
                      <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-black font-black w-20">Hours</th>
                      {role === 'manager' && (
                        <>
                          <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-black font-black w-36">Rate/Hr (AED)</th>
                          <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-black font-black w-28">Total</th>
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
                            <Input className="h-10 text-sm font-bold text-black bg-white border-slate-400 border-2 rounded-lg" placeholder="Labor description" value={item.description} onChange={(e) => updateLabor(item.id, "description", e.target.value)} />
                          </td>
                          <td className="py-2.5 px-4">
                            <Input className="h-10 text-sm font-bold text-black bg-white border-slate-400 border-2 rounded-lg" type="number" min={0} step={0.5} value={item.hours} onChange={(e) => updateLabor(item.id, "hours", e.target.value === "" ? "" : Number(e.target.value))} />
                          </td>
                          {role === 'manager' && (
                            <>
                              <td className="py-2.5 px-4">
                                <Input
                                  className={priceInputClass(item.ratePerHour)}
                                  type="number" min={0} step={0.01}
                                  placeholder="Enter rate"
                                  value={item.ratePerHour || ""}
                                  onChange={(e) => updateLabor(item.id, "ratePerHour", e.target.value === "" ? 0 : Number(e.target.value))}
                                />
                              </td>
                              <td className="py-2.5 px-4">
                                <span className="font-black text-sm text-black">AED {(Number(item.totalCost) || 0).toFixed(2)}</span>
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
            )
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
