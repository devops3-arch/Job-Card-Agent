import { describe, test, expect } from 'vitest';

process.env.ACCESS_TOKEN_SECRET = 'test-access-secret-for-unit-tests';

const { generateAccessToken, generateRefreshToken, hashToken, getRefreshTokenExpiresAt } =
  await import('./tokenService.js');

describe('generateAccessToken', () => {
  test('produces a three-part JWT carrying the identity claims', () => {
    const token = generateAccessToken({ id: 8, name: 'Arvind', email: 'a@b.com', role: 'manager' });
    const parts = token.split('.');

    expect(parts).toHaveLength(3);
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    expect(claims.id).toBe(8);
    expect(claims.role).toBe('manager');
  });

  test('never embeds the password hash', () => {
    const token = generateAccessToken({
      id: 8, name: 'A', email: 'a@b.com', role: 'manager', password_hash: '$2a$10$secrethash',
    });

    expect(token).not.toContain('secrethash');
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    expect(claims.password_hash).toBeUndefined();
  });

  test('sets an expiry', () => {
    const token = generateAccessToken({ id: 1, role: 'admin' });
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());

    expect(claims.exp).toBeGreaterThan(claims.iat);
  });
});

describe('generateRefreshToken', () => {
  test('is long and unguessable', () => {
    const token = generateRefreshToken();

    expect(token.length).toBeGreaterThanOrEqual(32);
  });

  test('never repeats', () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateRefreshToken()));

    expect(seen.size).toBe(200);
  });
});

describe('hashToken', () => {
  test('is deterministic, so a stored hash can be looked up', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
  });

  test('differs per token', () => {
    expect(hashToken('abc')).not.toBe(hashToken('abd'));
  });

  test('does not return the token itself — the database must never hold the raw value', () => {
    const raw = generateRefreshToken();

    expect(hashToken(raw)).not.toBe(raw);
    expect(hashToken(raw)).not.toContain(raw);
  });
});

describe('getRefreshTokenExpiresAt', () => {
  test('is in the future', () => {
    expect(new Date(getRefreshTokenExpiresAt()).getTime()).toBeGreaterThan(Date.now());
  });
});
