type DncBatchPayload = {
  phoneNumbers: string[];
};

type DncScrubPayload = FormData | DncBatchPayload;

export async function scrubDnc(payload: DncScrubPayload) {
  if (payload instanceof FormData) {
    return fetch('/api/usha/scrub-csv', {
      method: 'POST',
      body: payload,
    });
  }

  return fetch('/api/dnc', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}
