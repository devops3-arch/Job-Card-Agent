import { describe, test, expect } from "vitest";

import { computePricingSummary } from "./pricing";
import type { PartItem, LaborItem } from "@/types/jobCard";

/**
 * Mirrors backend/services/pricingService.test.js.
 *
 * These two calculators have to agree: the backend writes grand_total to
 * pricing_header and the dashboard reads it back, while this one produces the
 * figures printed on the customer's quotation PDF and Excel export. They drifted
 * once already — this file existed nowhere, the backend had seven tests, and the
 * frontend silently left labour out of the total. A real record held 1890 while
 * the quotation for the same job said 1575.
 *
 * The inputs differ in shape, so the cases are translated rather than copied:
 * the backend takes an absolute discountAmount and a vatPercent, this takes a
 * discountPercentage and fixes VAT at 5%. Where a backend case cannot be
 * expressed here, the equivalent is noted.
 */

const part = (qty: number, unitPrice: number): PartItem => ({
  id: `p${qty}-${unitPrice}`,
  description: "part",
  qty,
  unitPrice,
  totalPrice: qty * unitPrice,
});

const labour = (hours: number, rate: number): LaborItem => ({
  id: `l${hours}-${rate}`,
  description: "labour",
  hours,
  ratePerHour: rate,
  totalCost: hours * rate,
});

const summary = (over: Partial<Parameters<typeof computePricingSummary>[0]> = {}) =>
  computePricingSummary({
    parts: [],
    labor: [],
    otherExpenses: 0,
    serviceCharge: 0,
    discountPercentage: 0,
    ...over,
  });

describe("computePricingSummary — agreement with the backend", () => {
  // The backend's first case, number for number: parts 700, labour 600,
  // service charge 1200, 5% VAT, grand total 2625.
  test("totals parts, labour, service charge and VAT the way the stored record does", () => {
    const result = summary({
      parts: [part(2, 150), part(1, 400)],
      labor: [labour(3, 200)],
      serviceCharge: 1200,
    });

    expect(result.partsTotal).toBe(700);
    expect(result.laborTotal).toBe(600);
    expect(result.totalAfterDiscount).toBe(2500);
    expect(result.vat).toBe(125);
    expect(result.grandTotal).toBe(2625);
  });

  // The regression this file exists for. Labour used to be excluded, which gave
  // 1575 here instead of 1890 — the exact discrepancy found between a stored
  // record and the quotation printed for the same job.
  test("labour is charged, not merely displayed", () => {
    const result = summary({
      parts: [part(2, 150)],
      labor: [labour(3, 100)],
      serviceCharge: 1200,
    });

    expect(result.laborTotal).toBe(300);
    expect(result.totalCost).toBe(1800);
    expect(result.vat).toBe(90);
    expect(result.grandTotal).toBe(1890);
    expect(result.grandTotal).not.toBe(1575);
  });

  test("an engineer submission with prices zeroed produces a zero grand total", () => {
    const result = summary({
      parts: [part(2, 0)],
      labor: [labour(3, 0)],
    });

    expect(result.partsTotal).toBe(0);
    expect(result.laborTotal).toBe(0);
    expect(result.grandTotal).toBe(0);
  });

  test("pricing the same job makes it approvable", () => {
    const result = summary({
      parts: [part(2, 150)],
      labor: [labour(3, 200)],
    });

    expect(result.grandTotal).toBeGreaterThan(0);
    expect(result.grandTotal).toBe(945);
  });

  // The backend takes an absolute discount; here it is a percentage. 10% of 1000
  // is the same 100 the backend case subtracts, so the outcome must match.
  test("a discount reduces the taxable amount before VAT is applied", () => {
    const result = summary({
      parts: [part(1, 1000)],
      discountPercentage: 10,
    });

    expect(result.discount).toBe(100);
    expect(result.totalAfterDiscount).toBe(900);
    expect(result.vat).toBe(45);
    expect(result.grandTotal).toBe(945);
  });

  test("treats empty input as zero rather than NaN", () => {
    const result = summary();

    expect(result.partsTotal).toBe(0);
    expect(result.grandTotal).toBe(0);
    expect(Number.isNaN(result.grandTotal)).toBe(false);
  });

  test("applies 5 percent VAT", () => {
    const result = summary({ parts: [part(1, 100)] });

    expect(result.vat).toBe(5);
    expect(result.grandTotal).toBe(105);
  });
});

describe("computePricingSummary — line values arriving as strings", () => {
  // The form binds quantity and price straight to text inputs, so these arrive as
  // strings, and job rows come back from Postgres with numerics as strings too.
  test("coerces string line totals rather than concatenating them", () => {
    const result = computePricingSummary({
      parts: [{ id: "p", description: "part", qty: "2", unitPrice: "150", totalPrice: 300 }],
      labor: [{ id: "l", description: "labour", hours: "3", ratePerHour: "100", totalCost: 300 }],
      otherExpenses: 0,
      serviceCharge: 1200,
      discountPercentage: 0,
    });

    expect(result.totalCost).toBe(1800);
    expect(result.grandTotal).toBe(1890);
  });

  test("a missing or unparseable line total counts as zero, not NaN", () => {
    const result = computePricingSummary({
      parts: [{ id: "p", description: "part", qty: 1, unitPrice: 1, totalPrice: undefined as unknown as number }],
      labor: [{ id: "l", description: "labour", hours: 1, ratePerHour: 1, totalCost: "abc" as unknown as number }],
      otherExpenses: 0,
      serviceCharge: 100,
      discountPercentage: 0,
    });

    expect(Number.isNaN(result.grandTotal)).toBe(false);
    expect(result.totalCost).toBe(100);
  });
});

describe("computePricingSummary — the remaining divergence from the backend", () => {
  /**
   * otherExpenses is a field the costing section lets a manager edit, and it is
   * added to the total here — but the pricing route never passes it to
   * calculatePricingTotals, so the backend's stored grand_total ignores it. With
   * a non-zero value the quotation therefore charges MORE than the record, the
   * mirror image of the labour bug.
   *
   * Left as-is rather than silently resolved: dropping it would stop charging a
   * field users can fill in, and adding it to the backend would raise what
   * customers are billed. Both are business decisions. This test documents the
   * gap so it cannot drift further unnoticed, and fails loudly if the behaviour
   * changes without the decision being made.
   */
  test("otherExpenses is charged here but not by the backend — known gap", () => {
    const withExpenses = summary({ parts: [part(1, 100)], otherExpenses: 50 });
    const withoutExpenses = summary({ parts: [part(1, 100)] });

    expect(withExpenses.totalCost).toBe(150);
    expect(withoutExpenses.totalCost).toBe(100);
    // The backend would compute 100 for both, since it never sees the field.
    expect(withExpenses.totalCost - withoutExpenses.totalCost).toBe(50);
  });
});
