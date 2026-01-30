'use client';

import { createContext, useEffect, useMemo, useState } from 'react';

export type DncClaims = {
  iss?: string;
  sub?: string;
  exp?: number;
  expDate?: string;
  isExpired?: boolean;
};

export type DncAuthContextValue = {
  token: string;
  setToken: (token: string) => void;
  clearToken: () => void;
  claims: DncClaims | null;
  isValid: boolean;
};

export const DNC_TOKEN_STORAGE_KEY = 'dnc.jwt';

export const DncAuthContext = createContext<DncAuthContextValue | null>(null);

const base64UrlDecode = (value: string): string => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  try {
    return atob(padded);
  } catch {
    return '';
  }
};

export const decodeJwtClaims = (token: string): DncClaims | null => {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  const payload = base64UrlDecode(parts[1]);
  if (!payload) return null;
  try {
    const data = JSON.parse(payload) as { iss?: string; sub?: string; exp?: number };
    const exp = typeof data.exp === 'number' ? data.exp : undefined;
    const expDate = exp ? new Date(exp * 1000).toLocaleString() : undefined;
    const isExpired = exp ? Date.now() >= exp * 1000 : undefined;
    return {
      iss: data.iss,
      sub: data.sub,
      exp,
      expDate,
      isExpired,
    };
  } catch {
    return null;
  }
};

export function DncAuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(DNC_TOKEN_STORAGE_KEY);
    if (stored) {
      setToken(stored);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (token) {
      window.localStorage.setItem(DNC_TOKEN_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(DNC_TOKEN_STORAGE_KEY);
    }
  }, [token]);

  const claims = useMemo(() => (token ? decodeJwtClaims(token) : null), [token]);

  const isValid = useMemo(() => {
    if (!token) return false;
    if (!claims?.exp) return true;
    return !claims.isExpired;
  }, [token, claims]);

  const value = useMemo(
    () => ({
      token,
      setToken,
      clearToken: () => setToken(''),
      claims,
      isValid,
    }),
    [token, claims, isValid],
  );

  return <DncAuthContext.Provider value={value}>{children}</DncAuthContext.Provider>;
}
