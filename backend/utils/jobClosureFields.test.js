import { describe, test, expect } from 'vitest';

import {
  deriveClosureFields,
  CLOSURE_COLUMNS,
  FINAL_TEST_RUN_RESULTS,
  FINAL_EQUIPMENT_STATUSES,
} from './jobClosureFields.js';

/** The shape the job card form sends when the closure section is fully filled. */
const filledEvidence = {
  finalTestResult: 'Pass',
  finalEquipmentStatus: 'Fully Operational',
  quotationRequired: true,
  safetyCriticalIssue: true,
  escalatedToTime: 'R. Menon 14:20',
  internalChecklistCompleted: true,
  mandatoryAttachmentsVerified: true,
  // Collected by the form but has no dedicated column; must not leak through.
  jobReadyForInvoicing: true,
};

describe('deriveClosureFields', () => {
  test('maps a fully filled closure section onto the columns', () => {
    expect(deriveClosureFields(filledEvidence)).toEqual({
      final_test_run_result: 'Pass',
      final_equipment_status: 'Fully Operational',
      quotation_required: true,
      safety_critical_issue: true,
      escalated_to: 'R. Menon 14:20',
      internal_checklist_completed: true,
      attachments_verified: true,
    });
  });

  // An update builds one SET clause per column, so a key going missing would
  // leave whatever the previous save wrote — a stale "checklist completed" is
  // exactly the value that must not survive being unticked.
  test('always returns every closure column, so nothing stale is left behind', () => {
    const derived = deriveClosureFields({});

    expect(Object.keys(derived).sort()).toEqual([...CLOSURE_COLUMNS].sort());
  });

  test('an empty closure section produces nulls and falses, never undefined', () => {
    expect(deriveClosureFields({})).toEqual({
      final_test_run_result: null,
      final_equipment_status: null,
      quotation_required: false,
      safety_critical_issue: false,
      escalated_to: null,
      internal_checklist_completed: false,
      attachments_verified: false,
    });
  });

  test.each([[null], [undefined], ['not an object'], [42], [['array']]])(
    'treats %j as no evidence at all rather than throwing',
    (input) => {
      expect(deriveClosureFields(input)).toEqual(deriveClosureFields({}));
    },
  );
});

describe('deriveClosureFields — enumerated answers', () => {
  test.each(FINAL_TEST_RUN_RESULTS)('accepts the form value %s for the test run result', (value) => {
    expect(deriveClosureFields({ finalTestResult: value }).final_test_run_result).toBe(value);
  });

  test.each(FINAL_EQUIPMENT_STATUSES)('accepts the form value %s for equipment status', (value) => {
    expect(deriveClosureFields({ finalEquipmentStatus: value }).final_equipment_status).toBe(value);
  });

  // Approval decisions are made on these columns, so an unrecognised value has to
  // read as "not answered" rather than being written through.
  test.each([['Passed'], ['pass'], ['PASS'], ['Broken'], [''], ['  ']])(
    'rejects %j as a test run result',
    (value) => {
      expect(deriveClosureFields({ finalTestResult: value }).final_test_run_result).toBeNull();
    },
  );

  test('rejects an unrecognised equipment status', () => {
    expect(deriveClosureFields({ finalEquipmentStatus: 'Exploded' }).final_equipment_status).toBeNull();
  });

  test('trims surrounding whitespace before matching', () => {
    expect(deriveClosureFields({ finalTestResult: '  Pass  ' }).final_test_run_result).toBe('Pass');
  });
});

describe('deriveClosureFields — the checkboxes', () => {
  test('a real true is the only thing that counts as ticked', () => {
    expect(deriveClosureFields({ internalChecklistCompleted: true }).internal_checklist_completed).toBe(true);
  });

  // A client sending the string "false" must not have it read as consent, which
  // is what any truthiness check would have done.
  test.each([['false'], ['true'], ['yes'], [1], [0], [null], [undefined], [{}]])(
    '%j does not count as ticked',
    (value) => {
      expect(deriveClosureFields({ attachmentsVerified: value }).attachments_verified).toBe(false);
      expect(deriveClosureFields({ mandatoryAttachmentsVerified: value }).attachments_verified).toBe(false);
    },
  );
});

describe('deriveClosureFields — escalation details', () => {
  test('keeps the escalation note as typed', () => {
    expect(deriveClosureFields({ escalatedToTime: 'Called R. Menon 14:20' }).escalated_to)
      .toBe('Called R. Menon 14:20');
  });

  test.each([[''], ['   '], [null], [undefined]])('treats %j as no escalation details', (value) => {
    expect(deriveClosureFields({ escalatedToTime: value }).escalated_to).toBeNull();
  });

  // The column is VARCHAR(255); an over-long note should be stored short rather
  // than failing the whole save.
  test('truncates to the width of the column', () => {
    const long = 'x'.repeat(300);
    const derived = deriveClosureFields({ escalatedToTime: long });

    expect(derived.escalated_to).toHaveLength(255);
  });
});
