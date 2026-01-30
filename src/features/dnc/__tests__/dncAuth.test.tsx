import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import TokenInput from '../TokenInput';
import { DncAuthProvider, DNC_TOKEN_STORAGE_KEY, decodeJwtClaims } from '../DncAuthProvider';
import { useDncAuth } from '../useDncAuth';

const buildJwt = (payload: Record<string, unknown>) => {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.`;
};

const renderWithProvider = (container: HTMLDivElement) => {
  const root = createRoot(container);
  act(() => {
    root.render(
      <DncAuthProvider>
        <TokenInput />
      </DncAuthProvider>,
    );
  });
  return root;
};

describe('DNC auth UI', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
    window.localStorage.clear();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('hydrates token from localStorage and shows claims', () => {
    const token = buildJwt({ iss: 'usha', sub: 'owner', exp: 1735689600 });
    window.localStorage.setItem(DNC_TOKEN_STORAGE_KEY, token);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = renderWithProvider(container);

    const input = document.querySelector('#dnc-jwt-input') as HTMLInputElement;
    expect(input.value).toBe(token);
    expect(document.body.textContent).toContain('usha');
    expect(document.body.textContent).toContain('owner');

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('persists updates to localStorage', async () => {
    const TokenUpdater = ({ value }: { value: string }) => {
      const { setToken } = useDncAuth();
      React.useEffect(() => {
        setToken(value);
      }, [setToken, value]);
      return null;
    };

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = renderWithProvider(container);

    const token = buildJwt({ iss: 'usha', sub: 'manual' });
    act(() => {
      root.render(
        <DncAuthProvider>
          <TokenUpdater value={token} />
        </DncAuthProvider>,
      );
    });
    await act(async () => {});

    expect(window.localStorage.getItem(DNC_TOKEN_STORAGE_KEY)).toBe(token);

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('decodes expiration claims safely', () => {
    const token = buildJwt({ iss: 'usha', sub: 'owner', exp: 1735693200 });
    const claims = decodeJwtClaims(token);

    expect(claims?.iss).toBe('usha');
    expect(claims?.sub).toBe('owner');
    expect(claims?.exp).toBe(1735693200);
    expect(claims?.isExpired).toBe(false);
  });
});
