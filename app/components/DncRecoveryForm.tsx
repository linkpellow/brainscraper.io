'use client';

import { useEffect, useState } from 'react';

export type DncUiMode = 'hidden' | 'recovery';

export type DncUiStatus = {
  uiMode: DncUiMode;
  configured: boolean;
  masked?: string;
  expiresAt?: number;
};

type DncRecoveryFormProps = {
  className?: string;
  maskedToken?: string | null;
  expiresAt?: number | null;
  onTokenIssue?: (message: string) => void;
  onRefreshStatus: () => Promise<DncUiStatus | null>;
  onResolved?: () => void;
};

type TokenHealth = 'checking' | 'valid' | 'invalid' | 'missing';

export default function DncRecoveryForm({
  className = '',
  maskedToken,
  expiresAt,
  onTokenIssue,
  onRefreshStatus,
  onResolved,
}: DncRecoveryFormProps) {
  const [tokenInput, setTokenInput] = useState('');
  const [localMaskedToken, setLocalMaskedToken] = useState<string | null>(maskedToken ?? null);
  const [localExpiresAt, setLocalExpiresAt] = useState<number | null>(expiresAt ?? null);
  const [showToken, setShowToken] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [tokenHealth, setTokenHealth] = useState<TokenHealth>(maskedToken ? 'valid' : 'missing');

  useEffect(() => {
    setLocalMaskedToken(maskedToken ?? null);
    setLocalExpiresAt(expiresAt ?? null);
    setTokenHealth(maskedToken ? 'valid' : 'missing');
  }, [maskedToken, expiresAt]);

  const applyStatusSnapshot = (snapshot: DncUiStatus | null) => {
    if (!snapshot) {
      return;
    }

    setLocalMaskedToken(snapshot.masked ?? null);
    setLocalExpiresAt(typeof snapshot.expiresAt === 'number' ? snapshot.expiresAt : null);

    if (snapshot.uiMode === 'hidden') {
      setTokenHealth('valid');
      onResolved?.();
      return;
    }

    setTokenHealth(snapshot.configured ? 'invalid' : 'missing');
  };

  const validateToken = async (notifyOnFailure = false) => {
    try {
      setTokenHealth('checking');
      const response = await fetch('/api/settings/dnc/test', { method: 'POST' });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.reason || 'DNC token test failed');
      }

      const snapshot = await onRefreshStatus();
      applyStatusSnapshot(snapshot);

      return {
        ok: true as const,
        message: 'DNC refresh and scrub flow is valid.',
        resolved: snapshot?.uiMode === 'hidden',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'DNC refresh flow test failed';
      setTokenHealth('invalid');
      if (notifyOnFailure) {
        onTokenIssue?.(message);
      }
      return { ok: false as const, message, resolved: false };
    }
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setStatus(null);
      setTokenHealth('checking');
      const response = await fetch('/api/settings/dnc/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenInput }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Failed to save DNC access token');
      }

      setLocalMaskedToken(data.masked ?? null);
      setLocalExpiresAt(typeof data.expiresAt === 'number' ? data.expiresAt : null);
      setTokenInput('');

      if (data.uiMode === 'hidden') {
        const validation = await validateToken(true);
        if (!validation.resolved) {
          setStatus(validation.message);
        }
        return;
      }

      setTokenHealth('missing');
      setStatus('Token cleared.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save DNC access token';
      setTokenHealth('invalid');
      setStatus(message);
      onTokenIssue?.(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = async () => {
    try {
      setIsClearing(true);
      setStatus(null);
      const response = await fetch('/api/settings/dnc/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: '' }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Failed to clear DNC access token');
      }

      setLocalMaskedToken(null);
      setLocalExpiresAt(null);
      setTokenInput('');
      setTokenHealth('missing');
      setStatus('Token cleared.');
      applyStatusSnapshot(await onRefreshStatus());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to clear DNC access token';
      setTokenHealth('invalid');
      setStatus(message);
      onTokenIssue?.(message);
    } finally {
      setIsClearing(false);
    }
  };

  const handleTest = async () => {
    try {
      setIsTesting(true);
      setStatus(null);
      const validation = await validateToken(true);
      if (!validation.resolved) {
        setStatus(validation.message);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'DNC refresh flow test failed';
      setStatus(message);
      onTokenIssue?.(message);
    } finally {
      setIsTesting(false);
    }
  };

  const badgeClassName =
    tokenHealth === 'valid'
      ? 'badge-success'
      : tokenHealth === 'checking'
        ? 'badge-info'
        : 'badge-error';

  const badgeLabel =
    tokenHealth === 'valid'
      ? 'DNC Ready'
      : tokenHealth === 'checking'
        ? 'Checking...'
        : tokenHealth === 'missing'
          ? 'Needs Token'
          : 'Token Invalid';

  const expiresLabel =
    typeof localExpiresAt === 'number'
      ? new Date(localExpiresAt * 1000).toLocaleString()
      : 'not set';

  return (
    <div className={`rounded-xl border border-slate-700/50 bg-slate-900/40 px-4 py-3 text-xs text-slate-200 ${className}`.trim()}>
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-slate-100">DNC Access Token</span>
          <span className={`badge text-[10px] font-semibold ${badgeClassName}`}>
            {badgeLabel}
          </span>
          <span className="text-slate-400">Paste a fresh access token to restore managed DNC scrubbing.</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-slate-400">Stored token:</span>
          <span className="font-mono">{localMaskedToken || 'not set'}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-slate-400">Stored expiry:</span>
          <span>{expiresLabel}</span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type={showToken ? 'text' : 'password'}
          value={tokenInput}
          onChange={(event) => setTokenInput(event.target.value)}
          placeholder="Paste DNC access token"
          className="w-72 rounded-lg border border-slate-600 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-400"
        />
        <button
          type="button"
          onClick={() => setShowToken((prev) => !prev)}
          className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-200"
        >
          {showToken ? 'Hide' : 'Show'}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs text-white disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : 'Save Access Token'}
        </button>
        <button
          type="button"
          onClick={handleTest}
          disabled={isTesting}
          className="rounded-lg border border-emerald-500 px-3 py-1.5 text-xs text-emerald-200 disabled:opacity-50"
        >
          {isTesting ? 'Testing...' : 'Test Refresh Flow'}
        </button>
        <button
          type="button"
          onClick={handleClear}
          disabled={isClearing}
          className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-200 disabled:opacity-50"
        >
          {isClearing ? 'Clearing...' : 'Clear'}
        </button>
      </div>

      {status && <p className="mt-3 text-xs text-slate-300">{status}</p>}
    </div>
  );
}
