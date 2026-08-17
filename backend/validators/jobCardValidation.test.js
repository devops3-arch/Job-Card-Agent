import { describe, test, expect } from 'vitest';

import {
  collectJobCardIssues,
  throwIfIncomplete,
  isChecklistComplete,
  INCOMPLETE_JOB_ERROR,
} from './jobCardValidation.js';

const completeFields = {
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
};

const completeCard = {
  fields: completeFields,
  jobData: {
    engineer_name: 'Bijmon Mathai',
    compressor_checklist: [{ item: 'Oil level', status: 'done' }],
    dryer_checklist: [{ item: 'Drain valve', status: 'na' }],
  },
  parts: [{ part_name: 'Air filter', part_number: 'AF-100', quantity: 2 }],
  labor: [{ description: 'On-site service', hours: 3 }],
};

const fieldsOf = (issues) => issues.map((issue) => issue.field);

describe('isChecklistComplete', () => {
  test('accepts done, na and pending', () => {
    expect(isChecklistComplete([{ status: 'done' }, { status: 'na' }, { status: 'pending' }])).toBe(true);
  });

  test('is case and whitespace insensitive', () => {
    expect(isChecklistComplete([{ status: ' DONE ' }])).toBe(true);
  });

  test('rejects an empty checklist and unknown statuses', () => {
    expect(isChecklistComplete([])).toBe(false);
    expect(isChecklistComplete(null)).toBe(false);
    expect(isChecklistComplete([{ status: 'maybe' }])).toBe(false);
    expect(isChecklistComplete([{ status: 'done' }, {}])).toBe(false);
  });
});

describe('collectJobCardIssues', () => {
  test('a complete card produces no issues', () => {
    expect(collectJobCardIssues(completeCard)).toEqual([]);
  });

  test('reports every missing field at once rather than only the first', () => {
    const issues = collectJobCardIssues({ fields: {}, jobData: {}, parts: [], labor: [] });

    // 14 text fields + engineer name + two checklists + parts + labor.
    expect(issues.length).toBe(19);
    expect(fieldsOf(issues)).toContain('customer_name');
    expect(fieldsOf(issues)).toContain('equipment_year');
    expect(fieldsOf(issues)).toContain('job_data.engineer_name');
    expect(fieldsOf(issues)).toContain('parts');
    expect(fieldsOf(issues)).toContain('labor');
  });

  test('every issue carries a field and a readable message', () => {
    const issues = collectJobCardIssues({ fields: {}, jobData: {}, parts: [], labor: [] });

    for (const issue of issues) {
      expect(typeof issue.field).toBe('string');
      expect(issue.field.length).toBeGreaterThan(0);
      expect(issue.message).toMatch(/\w/);
    }
  });

  test('names the offending line item by index', () => {
    const issues = collectJobCardIssues({
      ...completeCard,
      parts: [
        { part_name: 'Air filter', part_number: 'AF-100', quantity: 2 },
        { part_name: '', part_number: '', quantity: 0 },
      ],
      labor: [{ description: 'x', hours: 0 }],
    });

    expect(fieldsOf(issues)).toEqual([
      'parts[1].part_name',
      'parts[1].part_number',
      'parts[1].quantity',
      'labor[0].hours',
    ]);
  });

  test('accepts the camelCase part shape the pricing panel sends', () => {
    const issues = collectJobCardIssues({
      ...completeCard,
      parts: [{ description: 'Air filter', partNumber: 'AF-100', qty: 2 }],
    });

    expect(issues).toEqual([]);
  });

  test('treats whitespace as missing', () => {
    const issues = collectJobCardIssues({
      ...completeCard,
      fields: { ...completeFields, customer_name: '   ' },
    });

    expect(fieldsOf(issues)).toEqual(['customer_name']);
  });

  test('rejects a non-string field rather than coercing it', () => {
    const issues = collectJobCardIssues({
      ...completeCard,
      fields: { ...completeFields, equipment_year: 2021 },
    });

    expect(fieldsOf(issues)).toEqual(['equipment_year']);
  });

  test('flags a missing job_data object as one issue, not three', () => {
    const issues = collectJobCardIssues({ ...completeCard, jobData: undefined });

    expect(fieldsOf(issues)).toEqual(['job_data']);
  });
});

describe('throwIfIncomplete', () => {
  test('does nothing when there are no issues', () => {
    expect(() => throwIfIncomplete([])).not.toThrow();
  });

  test('raises a 400 carrying every issue', () => {
    const issues = [{ field: 'parts', message: 'At least one part is required.' }];

    try {
      throwIfIncomplete(issues);
      throw new Error('expected throwIfIncomplete to throw');
    } catch (error) {
      expect(error.message).toBe(INCOMPLETE_JOB_ERROR);
      expect(error.statusCode).toBe(400);
      expect(error.errorCode).toBe('VALIDATION_ERROR');
      expect(error.details).toEqual(issues);
    }
  });
});
