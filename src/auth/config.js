const REFRESH_PREEMPT_MIN = 120;
const CHECK_INTERVAL_MS = 2 * 60 * 1000;
const URGENT_CHECK_MS = 1 * 60 * 1000;

const EXPIRED_REFRESH_ALLOWLIST = new Set([
  'api-identity-agent.ushadvisors.com',
  'agent.ushadvisors.com',
]);

function normalizeProviderHost(providerHost) {
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
}

function allowExpiredRefresh(providerHost) {
  const normalizedHost = normalizeProviderHost(providerHost);
  if (!normalizedHost) return false;
  if (EXPIRED_REFRESH_ALLOWLIST.has(normalizedHost)) return true;
  for (const allowedHost of EXPIRED_REFRESH_ALLOWLIST) {
    if (normalizedHost.endsWith(`.${allowedHost}`)) {
      return true;
    }
  }
  return false;
}

module.exports = {
  REFRESH_PREEMPT_MIN,
  CHECK_INTERVAL_MS,
  URGENT_CHECK_MS,
  allowExpiredRefresh,
};
