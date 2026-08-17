import { describe, test, expect } from 'vitest';

import {
  adminCreateUserSchema,
  adminSetPasswordSchema,
  jobUpdateSchema,
  pricingSchema,
  profileUpdateSchema,
} from './schemas.js';

describe('password complexity', () => {
  test('adminCreateUserSchema requires letters and numbers in passwords', () => {
    const base = { name: 'Test User', email: 'test@example.com', role: 'engineer' };

    expect(adminCreateUserSchema.safeParse({ ...base, password: 'StrongPass1' }).success).toBe(true);
    expect(adminCreateUserSchema.safeParse({ ...base, password: '12345678' }).success).toBe(false);
    expect(adminCreateUserSchema.safeParse({ ...base, password: 'StrongPassword' }).success).toBe(false);
  });

  test('adminSetPasswordSchema enforces the same rules', () => {
    expect(adminSetPasswordSchema.safeParse({ newPassword: 'AnotherPass2' }).success).toBe(true);
    expect(adminSetPasswordSchema.safeParse({ newPassword: 'short' }).success).toBe(false);
  });
});

describe('profileUpdateSchema', () => {
  test('accepts the fields Profile Settings sends', () => {
    const result = profileUpdateSchema.safeParse({
      fullName: 'Arvind Kumar Jaiswal',
      phone: '+971-55-1112223',
      department: 'Service Operations',
    });
    expect(result.success).toBe(true);
  });

  test('rejects privilege escalation through unexpected keys', () => {
    // Strict schema: role and is_active must not be settable from the profile screen.
    expect(profileUpdateSchema.safeParse({ role: 'admin' }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ fullName: 'X', is_active: true }).success).toBe(false);
  });

  test('rejects an empty update', () => {
    expect(profileUpdateSchema.safeParse({}).success).toBe(false);
  });
});

describe('jobUpdateSchema', () => {
  const validPayload = {
    customer_name: 'Gulf Cement Works',
    ref_no: 'REF-1',
    job_card_no: 'JC-1',
    job_date: '2026-08-17',
    service_type: 'Service Contract',
    customer_code: 'GCW01',
    attention_of: 'Mr Kareem',
    contact_no: '+971-50-1234567',
    sales_area: 'Dubai',
    equipment_model: 'BSD-72',
    equipment_brand_description: 'Kaeser rotary screw',
    equipment_part_no: 'PN-1',
    equipment_serial_no: 'SN-1',
    equipment_year: '2021',
    manager_id: 8,
    parts: [{ part_name: 'Air filter', part_number: 'AF-100', quantity: 2, unit_price: 150 }],
    labor: [{ description: 'On-site service', hours: 3, rate: 200 }],
    job_data: { engineer_name: 'Bijmon Mathai' },
  };

  test('accepts the payload the pricing panel sends', () => {
    expect(jobUpdateSchema.safeParse(validPayload).success).toBe(true);
  });

  test('rejects manager_name at the top level, which is why it travels in job_data', () => {
    const result = jobUpdateSchema.safeParse({ ...validPayload, manager_name: 'Arvind' });
    expect(result.success).toBe(false);
  });

  test('rejects a blank email rather than storing one', () => {
    expect(jobUpdateSchema.safeParse({ ...validPayload, email: '' }).success).toBe(false);
    expect(jobUpdateSchema.safeParse({ ...validPayload, email: 'a@b.com' }).success).toBe(true);
  });
});

describe('pricingSchema', () => {
  const totals = {
    labour_rate: 200,
    service_charge: 1200,
    discount: 0,
    vat_percent: 5,
    parts_total: 700,
    labour_total: 600,
    taxable_amount: 2500,
  };

  test('accepts the totals the pricing panel submits', () => {
    expect(pricingSchema.safeParse({ ...totals, vat_amount: 125, grand_total: 2625 }).success).toBe(true);
  });

  test('rejects negative money', () => {
    expect(pricingSchema.safeParse({ ...totals, parts_total: -1 }).success).toBe(false);
  });

  test('requires the totals it recomputes against', () => {
    const { parts_total, ...missing } = totals;
    expect(pricingSchema.safeParse(missing).success).toBe(false);
  });
});
