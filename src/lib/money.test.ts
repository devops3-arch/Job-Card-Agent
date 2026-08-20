import { describe, test, expect } from "vitest";

import { CURRENCY, NOT_PRICED, formatAmount, formatMoney } from "./money";

describe("formatMoney", () => {
  test("writes an amount with the currency", () => {
    expect(formatMoney(1890)).toBe("AED 1890.00");
  });

  // The bug this exists for: grand_total is a Postgres numeric, and
  // node-postgres returns those as strings. Code that checked for a number first
  // fell through to printing the bare string, so real totals lost their currency.
  test("handles a numeric that arrived as a string", () => {
    expect(formatMoney("1890")).toBe("AED 1890.00");
    expect(formatMoney("1890.00")).toBe("AED 1890.00");
    expect(formatMoney("1890.5")).toBe("AED 1890.50");
  });

  test("always shows two decimal places", () => {
    expect(formatMoney(1200)).toBe("AED 1200.00");
    expect(formatMoney(0.5)).toBe("AED 0.50");
  });

  test("zero is a real amount and is shown as one", () => {
    expect(formatMoney(0)).toBe("AED 0.00");
    expect(formatMoney("0")).toBe("AED 0.00");
  });

  // An unpriced job has no amount. Printing AED 0.00 would state a price nobody
  // set, so the absence is named instead.
  test.each([[null], [undefined], [""]])("reports %j as not priced", (value) => {
    expect(formatMoney(value)).toBe(NOT_PRICED);
  });

  test("unparseable input falls back rather than printing NaN", () => {
    expect(formatMoney("not a number")).toBe(NOT_PRICED);
    expect(formatMoney(Number.NaN)).toBe(NOT_PRICED);
    expect(formatMoney(1890)).not.toContain("NaN");
  });

  test("the fallback can be overridden", () => {
    expect(formatMoney(null, "—")).toBe("—");
  });

  test("uses one currency label", () => {
    expect(CURRENCY).toBe("AED");
    expect(formatMoney(1)).toContain(CURRENCY);
    expect(formatMoney(1)).not.toContain("₹");
    expect(formatMoney(1)).not.toContain("DHS");
  });
});

describe("formatAmount", () => {
  test("gives the number alone for a spreadsheet or PDF column", () => {
    expect(formatAmount(1890)).toBe("1890.00");
    expect(formatAmount("1890")).toBe("1890.00");
    expect(formatAmount(1890)).not.toContain("AED");
  });

  test("falls back to a zero string rather than NaN", () => {
    expect(formatAmount(null)).toBe("0.00");
    expect(formatAmount("abc")).toBe("0.00");
  });
});
