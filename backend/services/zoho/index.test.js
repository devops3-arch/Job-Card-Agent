import { describe, test, expect, beforeEach, afterEach } from 'vitest';

import { isConfigured, getEndpoints, buildLineItems, createInvoiceForJob } from './index.js';

const ZOHO_VARS = [
  'ZOHO_CLIENT_ID',
  'ZOHO_CLIENT_SECRET',
  'ZOHO_REFRESH_TOKEN',
  'ZOHO_ORGANIZATION_ID',
  'ZOHO_DC',
];

let saved = {};

beforeEach(() => {
  saved = Object.fromEntries(ZOHO_VARS.map((v) => [v, process.env[v]]));
  for (const v of ZOHO_VARS) delete process.env[v];
});

afterEach(() => {
  for (const [v, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[v];
    else process.env[v] = value;
  }
});

const configure = () => {
  process.env.ZOHO_CLIENT_ID = 'id';
  process.env.ZOHO_CLIENT_SECRET = 'secret';
  process.env.ZOHO_REFRESH_TOKEN = 'refresh';
  process.env.ZOHO_ORGANIZATION_ID = '12345';
};

describe('isConfigured', () => {
  test('false when nothing is set', () => {
    expect(isConfigured()).toBe(false);
  });

  test('false when only some credentials are present', () => {
    process.env.ZOHO_CLIENT_ID = 'id';
    process.env.ZOHO_CLIENT_SECRET = 'secret';
    expect(isConfigured()).toBe(false);
  });

  test('true only with all four required values', () => {
    configure();
    expect(isConfigured()).toBe(true);
  });
});

describe('getEndpoints', () => {
  test('defaults to the .com data centre', () => {
    const { accounts, api } = getEndpoints();
    expect(accounts).toContain('accounts.zoho.com');
    expect(api).toBe('https://www.zohoapis.com/books/v3');
  });

  test('honours a regional data centre', () => {
    expect(getEndpoints('eu').api).toBe('https://www.zohoapis.eu/books/v3');
    expect(getEndpoints('in').accounts).toContain('accounts.zoho.in');
  });
});

describe('buildLineItems', () => {
  test('maps parts and labour onto separate invoice lines', () => {
    const items = buildLineItems({
      parts: [{ part_name: 'Air filter', part_number: 'AF-100', quantity: 2, unit_price: 150 }],
      labor: [{ description: 'On-site service', hours: 3, rate: 200 }],
      serviceCharge: 0,
    });

    expect(items).toEqual([
      { name: 'Air filter', description: 'AF-100', quantity: 2, rate: 150 },
      { name: 'On-site service', description: 'Labour hours', quantity: 3, rate: 200 },
    ]);
  });

  test('adds the service charge as its own line when non-zero', () => {
    const items = buildLineItems({ parts: [], labor: [], serviceCharge: 1200 });

    expect(items).toEqual([{ name: 'Service charge', quantity: 1, rate: 1200 }]);
  });

  test('omits the service charge line when zero', () => {
    expect(buildLineItems({ serviceCharge: 0 })).toEqual([]);
  });

  test('drops zero-priced lines — an engineer submission has none worth invoicing', () => {
    const items = buildLineItems({
      parts: [{ part_name: 'Air filter', part_number: 'AF-100', quantity: 2, unit_price: 0 }],
      labor: [{ description: 'On-site service', hours: 3, rate: 0 }],
    });

    expect(items).toEqual([]);
  });

  test('drops a part with no name', () => {
    expect(buildLineItems({ parts: [{ part_name: '  ', quantity: 1, unit_price: 10 }] })).toEqual([]);
  });

  test('accepts the camelCase shape the pricing panel uses', () => {
    const items = buildLineItems({
      parts: [{ description: 'Oil separator', partNumber: 'OS-220', qty: 1, unitPrice: 400 }],
      labor: [{ description: 'Diagnosis', hours: 1, ratePerHour: 250 }],
    });

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ name: 'Oil separator', quantity: 1, rate: 400 });
    expect(items[1]).toMatchObject({ name: 'Diagnosis', quantity: 1, rate: 250 });
  });

  test('falls back to "Labour" when a labour line has no description', () => {
    const items = buildLineItems({ labor: [{ hours: 2, rate: 100 }] });

    expect(items[0].name).toBe('Labour');
  });

  test('tolerates being called with nothing', () => {
    expect(buildLineItems()).toEqual([]);
  });
});

describe('createInvoiceForJob', () => {
  test('is inert without credentials, and reports that rather than throwing', async () => {
    const result = await createInvoiceForJob({ job: { customer_name: 'Gulf Cement' } });

    expect(result.success).toBe(false);
    expect(result.skipped).toBe(true);
    expect(result.message).toMatch(/not configured/i);
  });

  test('refuses a job with nothing priced, without calling Zoho', async () => {
    configure();
    const result = await createInvoiceForJob({
      job: { customer_name: 'Gulf Cement' },
      parts: [{ part_name: 'Air filter', quantity: 1, unit_price: 0 }],
      labor: [],
    });

    expect(result.success).toBe(false);
    expect(result.skipped).toBeUndefined();
    expect(result.message).toMatch(/no priced lines/i);
  });
});
