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

  // laborTotal belongs in the total. It used to be computed, printed on the
  // quotation as its own line, and then left out of the sum — so every PDF and
  // Excel export under-billed by the labour charge and disagreed with the
  // grand_total the backend had already stored for the same job. Confirmed on a
  // real record: the database held 1890 (parts 300 + labour 300 + service 1200,
  // plus 5% VAT) while the customer's quotation said 1575.
  // backend/services/pricingService.js is the system of record here: it computes
  // subtotal as parts_total + labour_total + serviceCharge.
  const totalCost = partsTotal + laborTotal + normalizedOtherExpenses + normalizedServiceCharge;
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
