import { describe, test, expect, vi, beforeEach } from 'vitest';

// The manager signature check hits its own service; these tests are about the
// closure checks, so the signature is always present unless a test says otherwise.
vi.mock('./signatureService.js', () => ({
  getUserSignature: vi.fn(async () => ({ signature_url: '/uploads/sig.png' })),
}));

const { validateJobReadyForApproval } = await import('./jobWorkflowService.js');

/** A job that satisfies every approval rule, including the closure columns. */
const validJob = () => ({
  id: 1,
  customer_name: 'Acme Cold Storage',
  job_card_no: 'JC-1001',
  job_date: '2026-08-19',
  ref_no: 'REF-1',
  sales_area: 'Dubai',
  service_type: 'service_contract',
  email: 'ops@acme.test',
  contact_no: '+971500000000',
  engineer_id: 3,
  manager_id: 2,
  report_date: '2026-08-19',
  customer_location: 'Jebel Ali',
  warranty_status: 'In warranty',
  compressor_checklist: [],
  dryer_checklist: [],
  job_data: {},
  safety_critical_issue: false,
  escalated_to: null,
  quotation_required: false,
  final_test_run_result: 'Pass',
  final_equipment_status: 'Fully Operational',
  internal_checklist_completed: true,
  attachments_verified: true,
});

/**
 * A fake pg client that answers each of the queries the validator makes, keyed
 * off the table it selects from.
 */
const makeClient = (job, over = {}) => {
  const {
    parts = [{ description: 'Air filter', part_name: 'Air filter', quantity: 2, unit_price: 150 }],
    labor = [{ description: 'On-site service', hours: 3, rate: 100 }],
    pricing = [{ grand_total: 500, vat_amount: 25 }],
    approvedDocuments = [],
    onApprovedDocuments = null,
  } = over;

  return {
    query: async (sql) => {
      if (sql.includes('FROM job_master')) return { rows: job ? [job] : [] };
      if (sql.includes('FROM job_parts')) return { rows: parts };
      if (sql.includes('FROM job_labor')) return { rows: labor };
      if (sql.includes('FROM pricing_header')) return { rows: pricing };
      if (sql.includes('FROM approved_documents')) {
        if (onApprovedDocuments) return onApprovedDocuments();
        return { rows: approvedDocuments };
      }
      throw new Error(`unexpected query: ${sql}`);
    },
  };
};

const validate = (job, over) =>
  validateJobReadyForApproval({ jobId: 1, client: makeClient(job, over), approverId: 2 });

const fieldsIn = (result) => (result.error?.details ?? []).map((d) => d.field);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('validateJobReadyForApproval — baseline', () => {
  test('a fully filled job card is approvable', async () => {
    const result = await validate(validJob());

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  test('no longer reports closure problems as advisory warnings', async () => {
    // These used to come back as { success: true, advisory: [...] }, which meant
    // approval went ahead regardless. Nothing should return `advisory` now.
    const job = { ...validJob(), final_test_run_result: null };
    const result = await validate(job);

    expect(result.advisory).toBeUndefined();
    expect(result.success).toBe(false);
  });

  test('a missing job is reported as not found', async () => {
    const result = await validate(null);

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('JOB_NOT_FOUND');
  });
});

describe('validateJobReadyForApproval — closure checks now block', () => {
  test.each([
    ['final_test_run_result', { final_test_run_result: null }],
    ['final_equipment_status', { final_equipment_status: null }],
    ['internal_checklist_completed', { internal_checklist_completed: false }],
    ['attachments_verified', { attachments_verified: false }],
  ])('%s missing blocks approval', async (field, patch) => {
    const result = await validate({ ...validJob(), ...patch });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('JOB_NOT_READY_FOR_APPROVAL');
    expect(fieldsIn(result)).toContain(field);
  });

  // A default-false boolean must not be readable as consent, and neither should
  // a truthy string — the column is written from a checkbox.
  test.each([[false], [null], [undefined], ['false'], ['no'], [0]])(
    'internal_checklist_completed of %j is not treated as completed',
    async (value) => {
      const result = await validate({ ...validJob(), internal_checklist_completed: value });

      expect(fieldsIn(result)).toContain('internal_checklist_completed');
    },
  );
});

describe('validateJobReadyForApproval — safety critical escalation', () => {
  test('a safety critical job with no escalation details is blocked', async () => {
    const result = await validate({ ...validJob(), safety_critical_issue: true, escalated_to: null });

    expect(result.success).toBe(false);
    expect(fieldsIn(result)).toContain('escalated_to');
  });

  test('whitespace does not count as escalation details', async () => {
    const result = await validate({ ...validJob(), safety_critical_issue: true, escalated_to: '   ' });

    expect(fieldsIn(result)).toContain('escalated_to');
  });

  test('a safety critical job with escalation details is approvable', async () => {
    const result = await validate({
      ...validJob(),
      safety_critical_issue: true,
      escalated_to: 'Escalated to R. Menon 14:20',
    });

    expect(result.success).toBe(true);
  });

  test('escalation is not demanded when nothing is flagged as safety critical', async () => {
    const result = await validate({ ...validJob(), safety_critical_issue: false, escalated_to: null });

    expect(result.success).toBe(true);
  });
});

describe('validateJobReadyForApproval — quotation documents', () => {
  test('a job requiring a quotation with no approved document is blocked', async () => {
    const result = await validate({ ...validJob(), quotation_required: true }, { approvedDocuments: [] });

    expect(result.success).toBe(false);
    expect(fieldsIn(result)).toContain('approved_documents');
  });

  test('an approved document satisfies the requirement', async () => {
    const result = await validate({ ...validJob(), quotation_required: true }, { approvedDocuments: [{ id: 9 }] });

    expect(result.success).toBe(true);
  });

  // The lookup used to sit inside a try/catch that logged and carried on, so a
  // database failure meant the job sailed through as approvable.
  test('a failure looking up approved documents is not swallowed into an approval', async () => {
    const blowUp = () => {
      throw new Error('connection terminated unexpectedly');
    };

    await expect(
      validate({ ...validJob(), quotation_required: true }, { onApprovedDocuments: blowUp }),
    ).rejects.toThrow('connection terminated unexpectedly');
  });
});

describe('validateJobReadyForApproval — pre-existing rules still hold', () => {
  test('missing parts and labour are still reported', async () => {
    const result = await validate(validJob(), { parts: [], labor: [] });

    expect(result.success).toBe(false);
    expect(fieldsIn(result)).toEqual(expect.arrayContaining(['parts', 'labor']));
  });

  test('all closure problems are reported together, not one at a time', async () => {
    const result = await validate({
      ...validJob(),
      final_test_run_result: null,
      final_equipment_status: null,
      internal_checklist_completed: false,
      attachments_verified: false,
    });

    expect(fieldsIn(result)).toEqual(
      expect.arrayContaining([
        'final_test_run_result',
        'final_equipment_status',
        'internal_checklist_completed',
        'attachments_verified',
      ]),
    );
  });
});
