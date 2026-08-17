import { describe, test, expect } from 'vitest';

import {
  JOB_STATUSES,
  normalizeStatus,
  getAllowedTransitions,
  canTransition,
} from './jobWorkflowService.js';

describe('normalizeStatus', () => {
  test('maps legacy status names onto current ones', () => {
    expect(normalizeStatus('WAITING_PRICING')).toBe(JOB_STATUSES.SUBMITTED);
    expect(normalizeStatus('WAITING_APPROVAL')).toBe(JOB_STATUSES.PENDING_APPROVAL);
    expect(normalizeStatus('CLOSED')).toBe(JOB_STATUSES.COMPLETED);
  });

  test('is case and whitespace insensitive', () => {
    expect(normalizeStatus('  approved ')).toBe(JOB_STATUSES.APPROVED);
  });

  test('returns null for no status', () => {
    expect(normalizeStatus(null)).toBeNull();
    expect(normalizeStatus(undefined)).toBeNull();
  });
});

describe('getAllowedTransitions', () => {
  test('a draft can be submitted or deleted, nothing else', () => {
    expect(getAllowedTransitions(JOB_STATUSES.DRAFT)).toEqual([
      JOB_STATUSES.SUBMITTED,
      JOB_STATUSES.DELETED,
    ]);
  });

  test('an approved job can only be completed or deleted', () => {
    expect(getAllowedTransitions(JOB_STATUSES.APPROVED)).toEqual([
      JOB_STATUSES.COMPLETED,
      JOB_STATUSES.DELETED,
    ]);
  });

  test('a deleted job is terminal', () => {
    expect(getAllowedTransitions(JOB_STATUSES.DELETED)).toEqual([]);
  });
});

describe('canTransition — role boundaries', () => {
  test('only a manager or admin may approve', () => {
    expect(canTransition(JOB_STATUSES.PENDING_APPROVAL, JOB_STATUSES.APPROVED, 'manager')).toBe(true);
    expect(canTransition(JOB_STATUSES.PENDING_APPROVAL, JOB_STATUSES.APPROVED, 'admin')).toBe(true);
    expect(canTransition(JOB_STATUSES.PENDING_APPROVAL, JOB_STATUSES.APPROVED, 'engineer')).toBe(false);
  });

  test('an engineer may submit their draft but not approve it', () => {
    expect(canTransition(JOB_STATUSES.DRAFT, JOB_STATUSES.SUBMITTED, 'engineer')).toBe(true);
    expect(canTransition(JOB_STATUSES.SUBMITTED, JOB_STATUSES.PENDING_APPROVAL, 'engineer')).toBe(true);
    expect(canTransition(JOB_STATUSES.SUBMITTED, JOB_STATUSES.APPROVED, 'engineer')).toBe(false);
  });

  test('an approved job cannot be reopened', () => {
    expect(canTransition(JOB_STATUSES.APPROVED, JOB_STATUSES.DRAFT, 'manager')).toBe(false);
    expect(canTransition(JOB_STATUSES.APPROVED, JOB_STATUSES.PENDING_APPROVAL, 'manager')).toBe(false);
  });

  test('nothing moves out of DELETED, not even for an admin', () => {
    expect(canTransition(JOB_STATUSES.DELETED, JOB_STATUSES.DRAFT, 'admin')).toBe(false);
    expect(canTransition(JOB_STATUSES.DELETED, JOB_STATUSES.APPROVED, 'manager')).toBe(false);
  });

  test('a no-op transition is rejected', () => {
    expect(canTransition(JOB_STATUSES.APPROVED, JOB_STATUSES.APPROVED, 'manager')).toBe(false);
  });

  test('an unknown role can do nothing', () => {
    expect(canTransition(JOB_STATUSES.PENDING_APPROVAL, JOB_STATUSES.APPROVED, 'viewer')).toBe(false);
    expect(canTransition(JOB_STATUSES.DRAFT, JOB_STATUSES.SUBMITTED, undefined)).toBe(false);
  });

  test('an invented status is rejected', () => {
    expect(canTransition(JOB_STATUSES.DRAFT, 'PAID', 'admin')).toBe(false);
  });

  test('legacy status names still route correctly', () => {
    // A job stored as WAITING_APPROVAL is a PENDING_APPROVAL job.
    expect(canTransition('WAITING_APPROVAL', JOB_STATUSES.APPROVED, 'manager')).toBe(true);
  });
});
