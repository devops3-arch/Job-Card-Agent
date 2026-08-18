import { describe, test, expect, vi } from 'vitest';
import { z, ZodError } from 'zod';

import errorHandler from './errorHandler.js';
import AppError from '../utils/AppError.js';

// A minimal Express response that records what was sent.
const mkRes = () => {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => { res.body = payload; return res; };
  return res;
};

const mkReq = () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  headers: {},
});

const handle = (error) => {
  const res = mkRes();
  errorHandler(error, mkReq(), res, vi.fn());
  return res;
};

describe('AppError passthrough', () => {
  test('preserves status, code, message and details', () => {
    const details = [{ field: 'parts', message: 'At least one part is required.' }];
    const res = handle(new AppError('Job card is incomplete.', 400, 'VALIDATION_ERROR', details));

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toBe('Job card is incomplete.');
    expect(res.body.error.details).toEqual(details);
  });

  test('always supplies details as an array', () => {
    const res = handle(new AppError('Job not found', 404, 'JOB_NOT_FOUND'));

    expect(Array.isArray(res.body.error.details)).toBe(true);
    expect(res.body.error.details).toEqual([]);
  });
});

describe('403 responses are deliberately vague', () => {
  test('a forbidden error does not echo back why', () => {
    const res = handle(new AppError('Engineers can only update their own jobs', 403, 'FORBIDDEN'));

    expect(res.statusCode).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(res.body.error.message).toBe('You do not have permission to perform this action.');
    expect(res.body.error.message).not.toContain('Engineers');
  });
});

describe('unexpected errors do not leak internals', () => {
  test('a raw Error becomes a generic 500', () => {
    const res = handle(new Error('connect ECONNREFUSED 10.0.0.4:5432 password=hunter2'));

    expect(res.statusCode).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_SERVER_ERROR');
    expect(res.body.error.message).toBe('Internal server error');
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
  });

  test('no stack trace ever reaches the client', () => {
    const res = handle(new Error('boom'));

    expect(JSON.stringify(res.body)).not.toContain('at ');
    expect(res.body.error.stack).toBeUndefined();
  });
});

describe('framework errors are translated', () => {
  test('a Zod error becomes a 400 with path-keyed details', () => {
    const schema = z.object({ email: z.string().email() }).strict();
    let zodError;
    try {
      schema.parse({ email: 'nope' });
    } catch (error) {
      zodError = error;
    }
    expect(zodError).toBeInstanceOf(ZodError);

    const res = handle(zodError);

    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details[0].path).toBe('email');
  });

  test('an oversized payload becomes 413', () => {
    const error = Object.assign(new Error('request entity too large'), { type: 'entity.too.large' });
    const res = handle(error);

    expect(res.statusCode).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  test('malformed JSON becomes a 400 rather than a 500', () => {
    const error = Object.assign(new SyntaxError('Unexpected token }'), { status: 400, body: '{bad' });
    const res = handle(error);

    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON_PAYLOAD');
  });

  test('a JWT error becomes 401, not 500', () => {
    const res = handle(Object.assign(new Error('jwt malformed'), { name: 'JsonWebTokenError' }));

    expect(res.statusCode).toBe(401);
    expect(res.body.error.code).toBe('JWT_INVALID_TOKEN');
  });

  test('an expired token becomes 401 with its own code', () => {
    const res = handle(Object.assign(new Error('jwt expired'), { name: 'TokenExpiredError' }));

    expect(res.statusCode).toBe(401);
    expect(res.body.error.code).toBe('JWT_EXPIRED_TOKEN');
  });
});
