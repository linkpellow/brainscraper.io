'use client';

import { useMemo } from 'react';
import { useDncAuth } from './useDncAuth';

export default function TokenInput() {
  const { token, setToken, clearToken, claims, isValid } = useDncAuth();

  const statusLabel = useMemo(() => {
    if (!token) return 'No token saved';
    if (!claims?.exp) return isValid ? 'Valid (no exp claim)' : 'Invalid token';
    if (claims.isExpired) return 'Expired';
    return 'Valid';
  }, [token, claims, isValid]);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="dnc-jwt-input" className="block text-sm font-medium text-slate-200">DNC JWT</label>
        <input
          id="dnc-jwt-input"
          type="text"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder="Paste your USHA JWT token"
          className="w-full rounded-lg border border-slate-600 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-400"
        />
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>{statusLabel}</span>
          <button
            type="button"
            onClick={clearToken}
            className="text-rose-300 hover:text-rose-200"
          >
            Clear token
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-4 text-sm text-slate-200">
        <h3 className="text-sm font-semibold text-slate-100">Decoded claims</h3>
        {token && !claims && (
          <p className="mt-2 text-xs text-amber-300">
            Unable to decode this token. Make sure it is a valid JWT string.
          </p>
        )}
        {!token && <p className="mt-2 text-xs text-slate-400">No token stored yet.</p>}
        {claims && (
          <dl className="mt-3 space-y-2 text-xs text-slate-300">
            <div className="flex justify-between">
              <dt className="text-slate-400">Issuer</dt>
              <dd className="text-right">{claims.iss || '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Subject</dt>
              <dd className="text-right">{claims.sub || '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Expiration</dt>
              <dd className="text-right">{claims.expDate || '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Status</dt>
              <dd className="text-right">{statusLabel}</dd>
            </div>
          </dl>
        )}
      </div>
    </div>
  );
}
