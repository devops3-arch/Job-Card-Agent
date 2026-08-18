import { describe, test, expect, beforeEach, afterEach } from 'vitest';

import { EMAILABLE, isEmailable, getTemplate } from './notificationTemplates.js';

const job = { reference: 'JC-1001', summary: 'Job card:  JC-1001\nCustomer:  Gulf Cement Works' };

describe('which notifications become emails', () => {
  test('job lifecycle events are emailed', () => {
    expect(isEmailable('JOB_APPROVAL_NEEDED')).toBe(true);
    expect(isEmailable('PRICING_SUBMITTED')).toBe(true);
    expect(isEmailable('JOB_APPROVED')).toBe(true);
    expect(isEmailable('JOB_CLOSED')).toBe(true);
    expect(isEmailable('SIGNATURE_UPLOADED')).toBe(true);
  });

  test('security and audit events are not emailed', () => {
    // An email per login is noise; these belong in the audit log only.
    expect(isEmailable('USER_LOGIN')).toBe(false);
    expect(isEmailable('USER_LOGOUT')).toBe(false);
    expect(isEmailable('TOKEN_REFRESH')).toBe(false);
    expect(isEmailable('USER_ACTIVITY')).toBe(false);
  });

  test('an unknown type is not emailed and has no template', () => {
    expect(isEmailable('SOMETHING_NEW')).toBe(false);
    expect(getTemplate('SOMETHING_NEW')).toBeNull();
  });
});

describe('message content', () => {
  test('every template puts the job reference in the subject', () => {
    for (const type of Object.keys(EMAILABLE)) {
      expect(getTemplate(type).subject(job)).toContain('JC-1001');
    }
  });

  test('every template includes the job summary and a link', () => {
    for (const type of Object.keys(EMAILABLE)) {
      const body = getTemplate(type).body(job);
      expect(body).toContain('Gulf Cement Works');
      expect(body).toContain('http');
    }
  });

  test('all five lifecycle events have a template', () => {
    expect(Object.keys(EMAILABLE).sort()).toEqual([
      'JOB_APPROVAL_NEEDED', 'JOB_APPROVED', 'JOB_CLOSED', 'PRICING_SUBMITTED', 'SIGNATURE_UPLOADED',
    ]);
  });

  test('the approval request says what is being asked for', () => {
    const template = getTemplate('JOB_APPROVAL_NEEDED');
    expect(template.subject(job)).toMatch(/approval/i);
    expect(template.body(job)).toMatch(/waiting for pricing and approval/i);
  });
});

describe('link target', () => {
  const original = process.env.FRONTEND_URL;

  beforeEach(() => {
    process.env.FRONTEND_URL = 'https://jobcards.example.com';
  });

  afterEach(() => {
    if (original === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = original;
  });

  test('uses FRONTEND_URL when set, read at send time rather than import time', () => {
    expect(getTemplate('JOB_APPROVED').body(job)).toContain('https://jobcards.example.com');
  });
});
