import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scrubDnc } from '../dncClient';
import { DNC_TOKEN_STORAGE_KEY } from '../../features/dnc/DncAuthProvider';

describe('dncClient', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('{}', { status: 200 }))));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('attaches Authorization header for batch scrubs', async () => {
    window.localStorage.setItem(DNC_TOKEN_STORAGE_KEY, 'token-123');

    await scrubDnc({ phoneNumbers: ['15551234567'] });

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/dnc',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer token-123',
        }),
      }),
    );
  });

  it('passes Authorization header for CSV scrubs', async () => {
    const formData = new FormData();
    formData.append('file', new File(['a,b\n'], 'sample.csv'));

    await scrubDnc(formData, { token: 'token-456' });

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/usha/scrub-csv',
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer token-456',
        },
      }),
    );
  });
});
