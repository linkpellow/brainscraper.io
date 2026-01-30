import { DNC_TOKEN_STORAGE_KEY } from '../features/dnc/DncAuthProvider';

type DncBatchPayload = {
  phoneNumbers: string[];
};

type DncScrubPayload = FormData | DncBatchPayload;

type ScrubOptions = {
  token?: string;
};

const resolveToken = (options?: ScrubOptions): string | undefined => {
  if (options?.token) return options.token;
  if (typeof window === 'undefined') return undefined;
  return window.localStorage.getItem(DNC_TOKEN_STORAGE_KEY) ?? undefined;
};

const buildAuthHeader = (token?: string): Record<string, string> => {
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
};

export async function scrubDnc(payload: DncScrubPayload, options?: ScrubOptions) {
  const token = resolveToken(options);
  const authHeader = buildAuthHeader(token);

  if (payload instanceof FormData) {
    return fetch('/api/usha/scrub-csv', {
      method: 'POST',
      headers: authHeader,
      body: payload,
    });
  }

  return fetch('/api/dnc', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify(payload),
  });
}
