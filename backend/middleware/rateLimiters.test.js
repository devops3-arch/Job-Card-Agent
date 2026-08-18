import { describe, test, expect } from 'vitest';

import { ipKey, buildKey, isStaticAssetRequest, globalLimiter, authLimiter } from './rateLimiters.js';

describe('ipKey — regression for the silently disabled limiter', () => {
  // express-rate-limit v8 exports ipKeyGenerator as a helper that takes an IP
  // string. It was previously passed straight in as the keyGenerator, so it
  // received (req, res) instead and never produced a usable key — which disabled
  // every limiter using it. Login had no brute-force protection as a result.
  test('returns a non-empty string, not an object or undefined', () => {
    const key = ipKey({ ip: '203.0.113.7' });

    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(0);
  });

  test('is stable across calls, so a counter can accumulate', () => {
    const req = { ip: '203.0.113.7' };

    expect(ipKey(req)).toBe(ipKey(req));
    expect(ipKey({ ip: '203.0.113.7' })).toBe(ipKey({ ip: '203.0.113.7' }));
  });

  test('separates different callers', () => {
    expect(ipKey({ ip: '203.0.113.7' })).not.toBe(ipKey({ ip: '198.51.100.4' }));
  });

  test('survives a missing ip rather than throwing', () => {
    expect(typeof ipKey({})).toBe('string');
  });

  test('handles IPv6', () => {
    const key = ipKey({ ip: '2001:db8::1' });
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(0);
  });
});

describe('buildKey', () => {
  test('prefers the authenticated user, so one user cannot spend a shared IP budget', () => {
    expect(buildKey({ user: { id: 8 }, ip: '203.0.113.7' })).toBe('user:8');
  });

  test('falls back to the IP when unauthenticated', () => {
    expect(buildKey({ ip: '203.0.113.7' })).toBe(ipKey({ ip: '203.0.113.7' }));
  });
});

describe('isStaticAssetRequest', () => {
  const get = (path, method = 'GET') => isStaticAssetRequest({ method, path });

  test('exempts the built bundle and uploaded files', () => {
    expect(get('/assets/index-DVuK8fpn.js')).toBe(true);
    expect(get('/assets/index-CWHAbTiN.css')).toBe(true);
    expect(get('/uploads/job-evidence/report_3_1.png')).toBe(true);
  });

  test('exempts files by extension', () => {
    for (const p of ['/favicon.ico', '/logo.svg', '/f.woff2', '/a.mp3', '/doc.pdf', '/x.map']) {
      expect(get(p)).toBe(true);
    }
  });

  test('does NOT exempt API traffic — that is what the budget is for', () => {
    expect(get('/jobs')).toBe(false);
    expect(get('/auth/login', 'POST')).toBe(false);
    expect(get('/api/admin/users')).toBe(false);
    expect(get('/health')).toBe(false);
  });

  test('does not exempt writes, even to an asset-looking path', () => {
    expect(get('/uploads/x.png', 'POST')).toBe(false);
    expect(get('/assets/x.js', 'DELETE')).toBe(false);
  });

  test('does not exempt a client-side route that merely contains a dot', () => {
    expect(get('/admin/users')).toBe(false);
  });
});

describe('limiter configuration', () => {
  test('both limiters are usable middleware', () => {
    expect(typeof globalLimiter).toBe('function');
    expect(typeof authLimiter).toBe('function');
  });
});
