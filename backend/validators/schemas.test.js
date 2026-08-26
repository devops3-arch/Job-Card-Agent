import test from 'node:test';
import assert from 'node:assert/strict';
import { adminCreateUserSchema, adminSetPasswordSchema } from './schemas.js';

test('adminCreateUserSchema requires letters and numbers in passwords', () => {
  const valid = adminCreateUserSchema.safeParse({
    name: 'Test User',
    email: 'test@example.com',
    password: 'StrongPass1',
    role: 'engineer',
  });

  assert.equal(valid.success, true);

  const missingLetter = adminCreateUserSchema.safeParse({
    name: 'Test User',
    email: 'test@example.com',
    password: '12345678',
    role: 'engineer',
  });

  assert.equal(missingLetter.success, false);

  const missingNumber = adminCreateUserSchema.safeParse({
    name: 'Test User',
    email: 'test@example.com',
    password: 'StrongPassword',
    role: 'engineer',
  });

  assert.equal(missingNumber.success, false);
});

test('adminSetPasswordSchema enforces the same password complexity rules', () => {
  const valid = adminSetPasswordSchema.safeParse({ newPassword: 'AnotherPass2' });
  assert.equal(valid.success, true);

  const invalid = adminSetPasswordSchema.safeParse({ newPassword: 'short' });
  assert.equal(invalid.success, false);
});
