import { motion, AnimatePresence } from "framer-motion";
import { Calculator, TrendingUp, Percent, Receipt, Coins } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PartItem, LaborItem, ServiceType } from "@/types/jobCard";

interface Props {
  parts: PartItem[];
  labor: LaborItem[];
  otherExpenses: number;
  onOtherExpensesChange: (val: number) => void;
  discountPercentage: number;
  onDiscountChange: (val: number) => void;
  salesArea: string;
  underWarranty: boolean;
  serviceType: ServiceType;
  serviceCharge: number;
  serviceChargeReason: string;
  onServiceChargeChange: (val: number) => void;
  onServiceChargeReasonChange: (val: string) => void;
}

const AnimatedValue = ({ value, prefix = "AED " }: { value: number; prefix?: string }) => {
  const num = Number(value) || 0;
  return (
    <motion.span
      key={num.toFixed(2)}
      initial={{ opacity: 0, y: -5 }}
      animate={{ opacity: 1, y: 0 }}
      className="font-black text-sm tabular-nums text-black"
    >
      {prefix}{num.toFixed(2)}
    </motion.span>
  );
};

const CostingSection = ({ parts, labor, otherExpenses, onOtherExpensesChange, discountPercentage, onDiscountChange, salesArea, underWarranty, serviceType, serviceCharge, serviceChargeReason, onServiceChargeChange, onServiceChargeReasonChange }: Props) => {
  const totalParts = parts.reduce((sum, p) => sum + (Number(p.totalPrice) || 0), 0);
  const totalLabor = labor.reduce((sum, l) => sum + (Number(l.totalCost) || 0), 0);
  const totalPartsCost = totalParts + totalLabor + otherExpenses + serviceCharge;
  const discount = totalPartsCost * (discountPercentage / 100);
  const totalAfterDiscount = totalPartsCost - discount;
  const vat = totalAfterDiscount * 0.05;
  const grandTotal = totalAfterDiscount + vat;
  const isAbuDhabiVariable = salesArea === "Abu Dhabi Variable";

  return (
    <div className="section-card">
      <h2 className="section-title">
        <span className="section-title-icon">
          <Calculator className="h-4 w-4 text-primary-foreground" />
        </span>
        Cost Summary
      </h2>

      <div className="max-w-lg space-y-0.5">
        <div className="cost-row">
          <div className="flex items-center gap-2">
            <Coins className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-sm text-black">Total Parts Cost</span>
          </div>
          <AnimatedValue value={totalParts} />
        </div>

        <div className="cost-row">
          <div className="flex items-center gap-2">
            <Receipt className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-sm text-black">Service Charge (AED)</span>
          </div>
          <AnimatedValue value={serviceCharge} />
        </div>

        <AnimatePresence>
          {isAbuDhabiVariable && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="rounded-3xl border border-border/60 bg-background p-4 mt-3"
            >
              <div className="grid gap-4">
                <div className="space-y-2">
                  <label className="field-label">Service Charge (AED) *</label>
                  <Input
                    className="w-full h-11 text-right text-sm font-bold text-black bg-white/80 rounded-xl border-slate-300 tabular-nums"
                    type="number"
                    min={0}
                    step={0.01}
                    value={serviceCharge}
                    onChange={(e) => onServiceChargeChange(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="field-label">Reason / Justification *</label>
                  <Textarea
                    className="w-full min-h-[120px] rounded-xl border-border/60 bg-white/80 text-sm text-black focus:border-primary focus:ring-2 focus:ring-primary/10"
                    value={serviceChargeReason}
                    onChange={(e) => onServiceChargeReasonChange(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Required when Abu Dhabi Variable is selected. Enter the approved service charge and justification.
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="cost-row">
          <span className="text-sm text-black">Total Labor Cost</span>
          <AnimatedValue value={totalLabor} />
        </div>

        <div className="cost-row border-t border-border/30 mt-1 pt-1">
          <span className="text-sm text-black">Other Expenses</span>
          <Input
            className="w-24 sm:w-32 h-9 text-right text-sm font-bold text-black bg-white/80 rounded-lg border-slate-300 tabular-nums"
            type="number"
            min={0}
            step={0.01}
            value={otherExpenses}
            onChange={(e) => onOtherExpensesChange(Number(e.target.value))}
          />
        </div>

        <div className="cost-row border-t border-border/30">
          <span className="text-sm text-black font-black">Total Cost</span>
          <AnimatedValue value={totalPartsCost} />
        </div>

        <div className="cost-row border-t border-border/30">
          <div className="flex items-center gap-1.5">
            <Percent className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-sm text-black">Discount (%)</span>
          </div>
          <Input
            className="w-24 sm:w-32 h-9 text-right text-sm font-bold text-black bg-white/80 rounded-lg border-slate-300 tabular-nums"
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={discountPercentage}
            onChange={(e) => onDiscountChange(Number(e.target.value))}
          />
        </div>

        <AnimatePresence>
          {discountPercentage > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="cost-row"
            >
              <span className="text-sm text-black">Discount Amount</span>
              <motion.span
                key={discount.toFixed(2)}
                initial={{ scale: 1.2 }}
                animate={{ scale: 1 }}
                className="font-black text-sm text-black tabular-nums"
              >
                - AED {discount.toFixed(2)}
              </motion.span>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="cost-row border-t border-border/30">
          <span className="text-sm text-black">Total After Discount</span>
          <AnimatedValue value={totalAfterDiscount} />
        </div>

        <div className="cost-row border-t border-border/30">
          <span className="text-sm text-black">VAT (5%)</span>
          <AnimatedValue value={vat} />
        </div>

        <motion.div
          className="flex justify-between items-center py-3 px-4 sm:py-5 sm:px-6 rounded-2xl mt-4"
          style={{ background: "var(--gradient-subtle)" }}
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.3, type: "spring" }}
          whileHover={{ scale: 1.01 }}
        >
          <div className="flex items-center gap-2.5">
            <motion.div animate={{ rotate: [0, 10, -10, 0] }} transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}>
              <TrendingUp className="h-5 w-5 text-black" />
            </motion.div>
            <span className="text-sm font-bold">Grand Total (incl. VAT)</span>
          </div>
          <motion.span
            key={grandTotal.toFixed(2)}
            initial={{ scale: 1.3, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-xl font-black text-black tabular-nums"
          >
            AED {grandTotal.toFixed(2)}
          </motion.span>
        </motion.div>
      </div>
    </div>
  );
};

export default CostingSection;