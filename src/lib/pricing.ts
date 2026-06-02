import type { PartItem, LaborItem } from "@/types/jobCard";

export interface PricingInput {
  parts: PartItem[];
  labor: LaborItem[];
  otherExpenses: number;
  serviceCharge: number;
  discountPercentage: number;
}

export interface PricingSummary {
  partsTotal: number;
  laborTotal: number;
  serviceCharge: number;
  otherExpenses: number;
  totalCost: number;
  discount: number;
  totalAfterDiscount: number;
  vat: number;
  grandTotal: number;
}

export function computePricingSummary({ parts, labor, otherExpenses, serviceCharge, discountPercentage }: PricingInput): PricingSummary {
  const partsTotal = parts.reduce((sum, p) => sum + (Number(p.totalPrice) || 0), 0);
  const laborTotal = labor.reduce((sum, l) => sum + (Number(l.totalCost) || 0), 0);
  const normalizedOtherExpenses = Number(otherExpenses) || 0;
  const normalizedServiceCharge = Number(serviceCharge) || 0;
  const totalCost = partsTotal + normalizedOtherExpenses + normalizedServiceCharge;
  const discount = totalCost * (discountPercentage / 100);
  const totalAfterDiscount = totalCost - discount;
  const vat = totalAfterDiscount * 0.05;
  const grandTotal = totalAfterDiscount + vat;

  return {
    partsTotal,
    laborTotal,
    serviceCharge: normalizedServiceCharge,
    otherExpenses: normalizedOtherExpenses,
    totalCost,
    discount,
    totalAfterDiscount,
    vat,
    grandTotal,
  };
}
