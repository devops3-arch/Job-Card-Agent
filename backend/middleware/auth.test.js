import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';

// The audit log writes to Postgres; these tests are about the guards, not the trail.
vi.mock('../audit.js', () => ({ logAuditEvent: vi.fn() }));

const SECRET = 'test-access-secret-for-unit-tests';
process.env.ACCESS_TOKEN_SECRET = SECRET;

const { requireAuth, requireRole, requireAdmin, requireDevOrAdmin } = await import('./auth.js');

const mkReq = (over = {}) => ({ headers: {}, originalUrl: '/x', method: 'GET', ...over });
const bearer = (payload, secret = SECRET) => ({
  headers: { authorization: `Bearer ${jwt.sign(payload, secret)}` },
  originalUrl: '/x',
  method: 'GET',
});

const run = (mw, req) => {
  const next = vi.fn();
  let thrown = null;
  try {
    mw(req, {}, next);
  } catch (error) {
    thrown = error;
  }
  return { next, thrown };
};

describe('requireAuth', () => {
  test('accepts a valid bearer token and attaches the user', () => {
    const req = bearer({ id: 8, role: 'manager', email: 'a@b.com' });
    const { next, thrown } = run(requireAuth, req);

    expect(thrown).toBeNull();
    expect(next).toHaveBeenCalled();
    expect(req.user.id).toBe(8);
    expect(req.user.role).toBe('manager');
  });

  test('rejects a token signed with the wrong secret', () => {
    const { next, thrown } = run(requireAuth, bearer({ id: 1, role: 'admin' }, 'not-the-secret'));

    expect(next).not.toHaveBeenCalled();
    expect(thrown?.statusCode).toBe(401);
    expect(thrown?.errorCode).toBe('AUTH_INVALID_TOKEN');
  });

  test('rejects an expired token', () => {
    const token = jwt.sign({ id: 1, role: 'admin' }, SECRET, { expiresIn: '-1s' });
    const { thrown } = run(requireAuth, { headers: { authorization: `Bearer ${token}` } });

    expect(thrown?.statusCode).toBe(401);
  });

  test('rejects a missing header', () => {
    const { thrown } = run(requireAuth, mkReq());

    expect(thrown?.statusCode).toBe(401);
    expect(thrown?.errorCode).toBe('AUTH_HEADER_REQUIRED');
  });

  test('rejects a header that is not a bearer token', () => {
    const { thrown } = run(requireAuth, mkReq({ headers: { authorization: 'Basic abc123' } }));

    expect(thrown?.statusCode).toBe(401);
  });

  test('does not treat the token as a bearer when the scheme is lowercased', () => {
    const token = jwt.sign({ id: 1, role: 'admin' }, SECRET);
    const { thrown } = run(requireAuth, mkReq({ headers: { authorization: `bearer ${token}` } }));

    expect(thrown?.statusCode).toBe(401);
  });
});

describe('the x-dev-user-role bypass', () => {
  const original = process.env.NODE_ENV;
  afterEach(() => { process.env.NODE_ENV = original; });

  test('works outside production, for local development', () => {
    process.env.NODE_ENV = 'development';
    const req = mkReq({ headers: { 'x-dev-user-role': 'manager', 'x-dev-user-id': '8' } });
    const { next, thrown } = run(requireAuth, req);

    expect(thrown).toBeNull();
    expect(next).toHaveBeenCalled();
    expect(req.user).toEqual({ id: 8, role: 'manager' });
  });

  test('is ignored in production — this is the gate that matters', () => {
    process.env.NODE_ENV = 'production';
    const { next, thrown } = run(requireAuth, mkReq({ headers: { 'x-dev-user-role': 'admin' } }));

    expect(next).not.toHaveBeenCalled();
    expect(thrown?.statusCode).toBe(401);
  });

  test('refuses an invented role even in development', () => {
    process.env.NODE_ENV = 'development';
    const { thrown } = run(requireAuth, mkReq({ headers: { 'x-dev-user-role': 'superuser' } }));

    expect(thrown?.statusCode).toBe(401);
  });
});

describe('requireRole', () => {
  test('allows a listed role', () => {
    const { next, thrown } = run(requireRole('manager', 'admin'), mkReq({ user: { id: 8, role: 'manager' } }));

    expect(thrown).toBeNull();
    expect(next).toHaveBeenCalled();
  });

  test('blocks an unlisted role with 403', () => {
    const { next, thrown } = run(requireRole('manager'), mkReq({ user: { id: 3, role: 'engineer' } }));

    expect(next).not.toHaveBeenCalled();
    expect(thrown?.statusCode).toBe(403);
    expect(thrown?.errorCode).toBe('FORBIDDEN');
  });

  test('admin passes any role check', () => {
    const { next } = run(requireRole('engineer'), mkReq({ user: { id: 1, role: 'admin' } }));

    expect(next).toHaveBeenCalled();
  });

  test('accepts roles passed as an array as well as varargs', () => {
    expect(run(requireRole(['manager']), mkReq({ user: { role: 'manager' } })).next).toHaveBeenCalled();
  });

  test('requires authentication first', () => {
    const { thrown } = run(requireRole('manager'), mkReq());

    expect(thrown?.statusCode).toBe(401);
    expect(thrown?.errorCode).toBe('AUTH_REQUIRED');
  });
});

describe('requireAdmin', () => {
  test('admin only', () => {
    expect(run(requireAdmin, mkReq({ user: { role: 'admin' } })).next).toHaveBeenCalled();
    expect(run(requireAdmin, mkReq({ user: { role: 'manager' } })).thrown?.statusCode).toBe(403);
    expect(run(requireAdmin, mkReq()).thrown?.statusCode).toBe(401);
  });
});

describe('requireDevOrAdmin', () => {
  const original = process.env.NODE_ENV;
  beforeEach(() => { process.env.NODE_ENV = 'production'; });
  afterEach(() => { process.env.NODE_ENV = original; });

  test('in production it demands an admin token', () => {
    const admin = bearer({ id: 1, role: 'admin' });
    expect(run(requireDevOrAdmin, admin).next).toHaveBeenCalled();

    const manager = bearer({ id: 8, role: 'manager' });
    expect(run(requireDevOrAdmin, manager).thrown?.statusCode).toBe(403);

    expect(run(requireDevOrAdmin, mkReq()).thrown?.statusCode).toBe(401);
  });

  test('outside production it lets development through', () => {
    process.env.NODE_ENV = 'development';
    expect(run(requireDevOrAdmin, mkReq()).next).toHaveBeenCalled();
  });
});
