import { describe, test, expect } from 'vitest';

import { calculatePricingTotals } from './pricingService.js';

describe('calculatePricingTotals', () => {
  test('totals parts, labour, service charge and VAT the way the stored record does', () => {
    const result = calculatePricingTotals({
      parts: [
        { quantity: 2, unit_price: 150 },
        { quantity: 1, unit_price: 400 },
      ],
      labour: [{ hours: 3, rate: 200 }],
      serviceCharge: 1200,
      discountAmount: 0,
      vatPercent: 5,
    });

    expect(result.parts_total).toBe(700);
    expect(result.labour_total).toBe(600);
    expect(result.taxable_amount).toBe(2500);
    expect(result.vat_amount).toBe(125);
    expect(result.grand_total).toBe(2625);
  });

  test('an engineer submission with prices zeroed produces a zero grand total', () => {
    // This is the state the server writes on submission — engineers do not price
    // work. A job in this state must fail approval, and it does because
    // grand_total is not greater than zero.
    const result = calculatePricingTotals({
      parts: [{ quantity: 2, unit_price: 0, total: 0 }],
      labour: [{ hours: 3, rate: 0, total: 0 }],
      serviceCharge: 0,
      discountAmount: 0,
      vatPercent: 5,
    });

    expect(result.parts_total).toBe(0);
    expect(result.labour_total).toBe(0);
    expect(result.grand_total).toBe(0);
  });

  test('pricing the same job makes it approvable', () => {
    const result = calculatePricingTotals({
      parts: [{ quantity: 2, unit_price: 150 }],
      labour: [{ hours: 3, rate: 200 }],
      serviceCharge: 0,
      discountAmount: 0,
      vatPercent: 5,
    });

    expect(result.grand_total).toBeGreaterThan(0);
    expect(result.grand_total).toBe(945);
  });

  test('a discount reduces the taxable amount before VAT is applied', () => {
    const result = calculatePricingTotals({
      parts: [{ quantity: 1, unit_price: 1000 }],
      labour: [],
      serviceCharge: 0,
      discountAmount: 100,
      vatPercent: 5,
    });

    expect(result.taxable_amount).toBe(900);
    expect(result.vat_amount).toBe(45);
    expect(result.grand_total).toBe(945);
  });

  test('falls back to an explicit line total when quantity and price are absent', () => {
    const result = calculatePricingTotals({
      parts: [{ total: 250 }],
      labour: [{ total: 150 }],
      vatPercent: 0,
    });

    expect(result.parts_total).toBe(250);
    expect(result.labour_total).toBe(150);
    expect(result.grand_total).toBe(400);
  });

  test('treats empty input as zero rather than NaN', () => {
    const result = calculatePricingTotals({});

    expect(result.parts_total).toBe(0);
    expect(result.grand_total).toBe(0);
    expect(Number.isNaN(result.grand_total)).toBe(false);
  });

  test('defaults VAT to 5 percent', () => {
    const result = calculatePricingTotals({ parts: [{ quantity: 1, unit_price: 100 }], labour: [] });

    expect(result.vat_percent).toBe(5);
    expect(result.vat_amount).toBe(5);
  });
});
