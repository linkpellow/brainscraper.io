import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock('./LeadListViewer', () => ({
  default: () => null,
}));

vi.mock('./FacebookLeadGenerator', () => ({
  default: () => null,
}));

vi.mock('./InstagramLeadGenerator', () => ({
  default: () => null,
}));

vi.mock('./EnrichmentStationControl', () => ({
  default: () => null,
}));

vi.mock('@/utils/enrichData', () => ({
  enrichData: vi.fn(),
}));

vi.mock('@/utils/extractLeadSummary', () => ({
  extractLeadSummary: vi.fn(),
  leadSummariesToCSV: vi.fn(() => ''),
}));

import LinkedInLeadGenerator from './LinkedInLeadGenerator';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function createStorageMock(): Storage {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
    get length() {
      return Object.keys(store).length;
    },
  };
}

describe('LinkedInLeadGenerator DNC recovery UI', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    // Required for React 19 act() support in Vitest/jsdom.
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.stubGlobal('localStorage', createStorageMock());
    vi.stubGlobal('sessionStorage', createStorageMock());
    sessionStorage.clear();
    localStorage.clear();
    vi.stubGlobal('alert', vi.fn());
    vi.stubGlobal('confirm', vi.fn(() => true));
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps the DNC section hidden when backend uiMode is hidden', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        uiMode: 'hidden',
        configured: true,
        masked: '********1234',
        expiresAt: 1773022490,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      root.render(<LinkedInLeadGenerator />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/settings/dnc/token');
    expect(container.textContent).not.toContain('DNC Access Token');
    expect(container.textContent).not.toContain('DNC token needs attention');
  });

  it('opens the recovery modal when backend uiMode is recovery', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        uiMode: 'recovery',
        configured: false,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      root.render(<LinkedInLeadGenerator />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('DNC token needs attention');
    expect(container.textContent).toContain('DNC Access Token');
    expect(container.textContent).toContain('Save Access Token');
  });
});
