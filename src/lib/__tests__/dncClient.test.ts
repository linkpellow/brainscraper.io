import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scrubDnc } from '../dncClient';
describe('dncClient', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('{}', { status: 200 }))));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts batch scrubs without client-side auth header', async () => {
    await scrubDnc({ phoneNumbers: ['15551234567'] });

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/dnc',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  it('posts CSV scrubs without client-side auth header', async () => {
    const formData = new FormData();
    formData.append('file', new File(['a,b\n'], 'sample.csv'));

    await scrubDnc(formData);

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/usha/scrub-csv',
      expect.objectContaining({ body: formData }),
    );
  });
});
