import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

const loadConfig = async () => {
  const module = await import('../config');
  return module;
};

beforeEach(() => {
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('auth config', () => {
  it('uses default values when env vars are unset', async () => {
    const { REFRESH_PREEMPT_MIN, CHECK_INTERVAL_MS, URGENT_CHECK_MS, allowExpiredRefresh } =
      await loadConfig();

    expect(typeof REFRESH_PREEMPT_MIN).toBe('number');
    expect(typeof CHECK_INTERVAL_MS).toBe('number');
    expect(typeof URGENT_CHECK_MS).toBe('number');
    expect(REFRESH_PREEMPT_MIN).toBe(120);
    expect(CHECK_INTERVAL_MS).toBe(2 * 60 * 1000);
    expect(URGENT_CHECK_MS).toBe(1 * 60 * 1000);
    expect(allowExpiredRefresh('https://api-identity-agent.ushadvisors.com/login')).toBe(true);
    expect(allowExpiredRefresh('https://example.com')).toBe(false);
  });

  it('supports env overrides', async () => {
    process.env.AUTH_REFRESH_PREEMPT_MIN = '90';
    process.env.AUTH_CHECK_INTERVAL_MS = '30000';
    process.env.AUTH_URGENT_CHECK_MS = '10000';
    process.env.AUTH_EXPIRED_REFRESH_ALLOWLIST = 'example.com';

    const { REFRESH_PREEMPT_MIN, CHECK_INTERVAL_MS, URGENT_CHECK_MS, allowExpiredRefresh } =
      await loadConfig();

    expect(REFRESH_PREEMPT_MIN).toBe(90);
    expect(CHECK_INTERVAL_MS).toBe(30000);
    expect(URGENT_CHECK_MS).toBe(10000);
    expect(allowExpiredRefresh('https://example.com')).toBe(true);
    expect(allowExpiredRefresh('https://sub.example.com')).toBe(true);
  });

  it('allows a global override for expired refresh checks', async () => {
    process.env.AUTH_ALLOW_EXPIRED_REFRESH_ALL = 'true';

    const { allowExpiredRefresh } = await loadConfig();

    expect(allowExpiredRefresh('https://not-in-list.com')).toBe(true);
  });
});
