const DEFAULT_REFRESH_PREEMPT_MIN = 120;
const DEFAULT_CHECK_INTERVAL_MS = 2 * 60 * 1000;
const DEFAULT_URGENT_CHECK_MS = 1 * 60 * 1000;

const DEFAULT_EXPIRED_REFRESH_ALLOWLIST = new Set([
  'api-identity-agent.ushadvisors.com',
  'agent.ushadvisors.com',
]);

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

const readNumberEnv = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
};

const readBooleanEnv = (name: string, fallback: boolean): boolean => {
  const raw = process.env[name];
  if (!raw) return fallback;
  return TRUE_VALUES.has(raw.trim().toLowerCase());
};

const parseAllowlistEnv = (name: string): string[] => {
  const raw = process.env[name];
  if (!raw) return [];
  return raw
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0);
};

const normalizeProviderHost = (providerHost?: string | null): string => {
  if (!providerHost) return '';
  const trimmed = providerHost.trim().toLowerCase();
  if (!trimmed) return '';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      return new URL(trimmed).host;
    } catch {
      return '';
    }
  }
  return trimmed.split('/')[0];
};

export const REFRESH_PREEMPT_MIN: number = readNumberEnv(
  'AUTH_REFRESH_PREEMPT_MIN',
  DEFAULT_REFRESH_PREEMPT_MIN,
);

export const CHECK_INTERVAL_MS: number = readNumberEnv(
  'AUTH_CHECK_INTERVAL_MS',
  DEFAULT_CHECK_INTERVAL_MS,
);

export const URGENT_CHECK_MS: number = readNumberEnv(
  'AUTH_URGENT_CHECK_MS',
  DEFAULT_URGENT_CHECK_MS,
);

const ALLOW_EXPIRED_REFRESH_ALL: boolean = readBooleanEnv(
  'AUTH_ALLOW_EXPIRED_REFRESH_ALL',
  false,
);

const EXPIRED_REFRESH_ALLOWLIST = new Set([
  ...DEFAULT_EXPIRED_REFRESH_ALLOWLIST,
  ...parseAllowlistEnv('AUTH_EXPIRED_REFRESH_ALLOWLIST'),
]);

export const allowExpiredRefresh = (providerHost?: string | null): boolean => {
  if (ALLOW_EXPIRED_REFRESH_ALL) return true;
  const normalizedHost = normalizeProviderHost(providerHost);
  if (!normalizedHost) return false;
  if (EXPIRED_REFRESH_ALLOWLIST.has(normalizedHost)) return true;
  for (const allowedHost of EXPIRED_REFRESH_ALLOWLIST) {
    if (normalizedHost.endsWith(`.${allowedHost}`)) {
      return true;
    }
  }
  return false;
};
