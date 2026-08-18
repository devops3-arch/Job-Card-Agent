import { describe, test, expect, vi } from 'vitest';
import { z } from 'zod';

import { validate } from './validate.js';

const mkRes = () => {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => { res.body = payload; return res; };
  return res;
};

const run = (middleware, req) => {
  const res = mkRes();
  const next = vi.fn();
  middleware(req, res, next);
  return { res, next };
};

const bodySchema = z.object({ email: z.string().email(), age: z.coerce.number().int() }).strict();

describe('validate — happy path', () => {
  test('calls next and replaces req.body with the parsed value', () => {
    const req = { body: { email: 'a@b.com', age: '42' }, method: 'POST', originalUrl: '/x' };
    const { next, res } = run(validate({ body: bodySchema }), req);

    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBeNull();
    // Coercion is the point: the route downstream gets a number, not "42".
    expect(req.body.age).toBe(42);
  });

  test('accepts a bare schema as shorthand for the body', () => {
    const req = { body: { email: 'a@b.com', age: 1 }, method: 'POST', originalUrl: '/x' };
    const { next } = run(validate(bodySchema), req);

    expect(next).toHaveBeenCalled();
  });

  test('leaves untargeted parts of the request alone', () => {
    const req = { body: { email: 'a@b.com', age: 1 }, params: { id: 'raw' }, method: 'POST', originalUrl: '/x' };
    run(validate({ body: bodySchema }), req);

    expect(req.params.id).toBe('raw');
  });
});

describe('validate — rejection shape', () => {
  test('returns 400 without calling next', () => {
    const req = { body: { email: 'nope', age: 'x' }, method: 'POST', originalUrl: '/x' };
    const { next, res } = run(validate({ body: bodySchema }), req);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('details are keyed by path, which is why error readers must check both path and field', () => {
    const req = { body: { email: 'nope', age: 1 }, method: 'POST', originalUrl: '/x' };
    const { res } = run(validate({ body: bodySchema }), req);

    expect(res.body.error.details[0]).toHaveProperty('path', 'email');
    expect(res.body.error.details[0]).toHaveProperty('message');
    expect(res.body.error.details[0]).not.toHaveProperty('field');
  });

  test('the human message sits at the top level, not inside error', () => {
    const req = { body: {}, method: 'POST', originalUrl: '/x' };
    const { res } = run(validate({ body: bodySchema }), req);

    expect(res.body.message).toBe('Validation failed');
    expect(res.body.error.message).toBeUndefined();
  });

  test('reports every offending field, not just the first', () => {
    const req = { body: {}, method: 'POST', originalUrl: '/x' };
    const { res } = run(validate({ body: bodySchema }), req);

    expect(res.body.error.details.length).toBeGreaterThanOrEqual(2);
  });

  test('a strict schema rejects unknown keys — this blocks privilege escalation via extra fields', () => {
    const req = { body: { email: 'a@b.com', age: 1, role: 'admin' }, method: 'POST', originalUrl: '/x' };
    const { next, res } = run(validate({ body: bodySchema }), req);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
  });

  test('validates params as well as body', () => {
    const idSchema = z.object({ id: z.coerce.number().int().positive() });
    const req = { params: { id: 'abc' }, method: 'GET', originalUrl: '/jobs/abc' };
    const { res } = run(validate({ params: idSchema }), req);

    expect(res.statusCode).toBe(400);
  });
});
