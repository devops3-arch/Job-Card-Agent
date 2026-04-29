import { motion, AnimatePresence } from "framer-motion";
import { Calculator, TrendingUp, Percent, Receipt, Coins } from "lucide-react";
import { Input } from "@/components/ui/input";
import { PartItem, LaborItem, SERVICE_CHARGE_MAP, ServiceType } from "@/types/jobCard";

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
}

const AnimatedValue = ({ value, prefix = "AED " }: { value: number; prefix?: string }) => (
  <motion.span
    key={value.toFixed(2)}
    initial={{ opacity: 0, y: -5 }}
    animate={{ opacity: 1, y: 0 }}
    className="font-semibold text-sm tabular-nums"
  >
    {prefix}{value.toFixed(2)}
  </motion.span>
);

const CostingSection = ({ parts, labor, otherExpenses, onOtherExpensesChange, discountPercentage, onDiscountChange, salesArea, underWarranty, serviceType }: Props) => {
  const totalParts = parts.reduce((sum, p) => sum + p.totalPrice, 0);
  const totalLabor = labor.reduce((sum, l) => sum + l.totalCost, 0);
  const isWaived = underWarranty || serviceType === "warranty" || serviceType === "service_contract";
  const serviceCharge = isWaived ? 0 : (SERVICE_CHARGE_MAP[salesArea] || 0);
  const totalPartsCost = totalParts + totalLabor + otherExpenses + serviceCharge;
  const discount = totalPartsCost * (discountPercentage / 100);
  const totalAfterDiscount = totalPartsCost - discount;
  const vat = totalAfterDiscount * 0.05;
  const grandTotal = totalAfterDiscount + vat;

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
            <span className="text-sm text-muted-foreground">Total Parts Cost</span>
          </div>
          <AnimatedValue value={totalParts} />
        </div>

        <div className="cost-row">
          <div className="flex items-center gap-2">
            <Receipt className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              Service Charge {isWaived ? <span className="text-success text-xs font-bold">(Waived)</span> : `(${salesArea || 'No location'})`}
            </span>
          </div>
          <AnimatedValue value={serviceCharge} />
        </div>

        <div className="cost-row">
          <span className="text-sm text-muted-foreground">Total Labor Cost</span>
          <AnimatedValue value={totalLabor} />
        </div>

        <div className="cost-row border-t border-border/30 mt-1 pt-1">
          <span className="text-sm text-muted-foreground">Other Expenses</span>
          <Input
            className="w-32 h-9 text-right text-sm rounded-lg border-border/60 font-semibold tabular-nums"
            type="number"
            min={0}
            step={0.01}
            value={otherExpenses}
            onChange={(e) => onOtherExpensesChange(Number(e.target.value))}
          />
        </div>

        <div className="cost-row border-t border-border/30">
          <span className="text-sm font-medium">Total Cost</span>
          <AnimatedValue value={totalPartsCost} />
        </div>

        <div className="cost-row border-t border-border/30">
          <div className="flex items-center gap-1.5">
            <Percent className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Discount (%)</span>
          </div>
          <Input
            className="w-32 h-9 text-right text-sm rounded-lg border-border/60 font-semibold tabular-nums"
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
              <span className="text-sm text-muted-foreground">Discount Amount</span>
              <motion.span
                key={discount.toFixed(2)}
                initial={{ scale: 1.2 }}
                animate={{ scale: 1 }}
                className="font-semibold text-sm text-destructive tabular-nums"
              >
                - AED {discount.toFixed(2)}
              </motion.span>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="cost-row border-t border-border/30">
          <span className="text-sm text-muted-foreground">Total After Discount</span>
          <AnimatedValue value={totalAfterDiscount} />
        </div>

        <div className="cost-row border-t border-border/30">
          <span className="text-sm text-muted-foreground">VAT (5%)</span>
          <AnimatedValue value={vat} />
        </div>

        <motion.div
          className="flex justify-between items-center py-5 px-6 rounded-2xl mt-4"
          style={{ background: "var(--gradient-subtle)" }}
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.3, type: "spring" }}
          whileHover={{ scale: 1.01 }}
        >
          <div className="flex items-center gap-2.5">
            <motion.div animate={{ rotate: [0, 10, -10, 0] }} transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}>
              <TrendingUp className="h-5 w-5 text-primary" />
            </motion.div>
            <span className="text-sm font-bold">Grand Total (incl. VAT)</span>
          </div>
          <motion.span
            key={grandTotal.toFixed(2)}
            initial={{ scale: 1.3, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-xl font-extrabold text-primary tabular-nums"
          >
            AED {grandTotal.toFixed(2)}
          </motion.span>
        </motion.div>
      </div>
    </div>
  );
};

export default CostingSection;