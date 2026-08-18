import { describe, test, expect, vi } from 'vitest';

import asyncHandler from './asyncHandler.js';

describe('asyncHandler', () => {
  test('forwards a rejected promise to next, so it reaches the error handler', async () => {
    const boom = new Error('database unreachable');
    const next = vi.fn();

    asyncHandler(async () => { throw boom; })({}, {}, next);
    await new Promise((r) => setImmediate(r));

    expect(next).toHaveBeenCalledWith(boom);
  });

  test('a synchronous throw propagates instead of vanishing', () => {
    const boom = new Error('sync failure');
    const next = vi.fn();

    // Promise.resolve(fn(...)) evaluates fn first, so a synchronous throw escapes
    // rather than reaching next. Documenting the real behaviour: Express catches a
    // sync throw from middleware itself, so it still reaches the error handler.
    expect(() => asyncHandler(() => { throw boom; })({}, {}, next)).toThrow('sync failure');
    expect(next).not.toHaveBeenCalled();
  });

  test('does not call next when the handler resolves', async () => {
    const next = vi.fn();

    asyncHandler(async (req, res) => { res.sent = true; })({}, {}, next);
    await new Promise((r) => setImmediate(r));

    expect(next).not.toHaveBeenCalled();
  });

  test('passes req, res and next through to the wrapped handler', async () => {
    const seen = [];
    const req = { id: 1 };
    const res = { id: 2 };
    const next = vi.fn();

    asyncHandler(async (a, b, c) => { seen.push(a, b, c); })(req, res, next);
    await new Promise((r) => setImmediate(r));

    expect(seen[0]).toBe(req);
    expect(seen[1]).toBe(res);
    expect(seen[2]).toBe(next);
  });
});
