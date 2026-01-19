'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Shield, Cpu, FileCode, Radio, FlaskConical, CheckCircle } from 'lucide-react';

type WasmReconResult = {
  ok: boolean;
  path: string;
  url?: string;
  error?: string;
  wat?: string;
  endpoints: string[];
  keys: string[];
  crypto: string[];
  exportedFuncs: string[];
  jsStubs: string;
};

type HeapFinding = { type: string; value: string; hint: string };
type HeapMinerResult = { ok: boolean; method: string; error?: string; stringsTotal: number; findings: HeapFinding[]; sample: string[] };

type WssFrame = { flow_id?: string; from_client?: boolean; content?: string; is_text?: boolean; ts?: number };

type HiddenDomItem = { type: string; selector?: string; valueSnippet?: string; attr?: string };

type DeepReconPanelProps = {
  wasmDecompiled: WasmReconResult[];
  heapFindings: HeapMinerResult | null;
  wssFrames: WssFrame[];
  hiddenDomFindings?: HiddenDomItem[];
  onSandboxRequest: (url: string) => Promise<{ ok?: boolean; error?: string; status?: number; body?: string; durationMs?: number }>;
};

const APEX_CRITERIA = [
  'Native net (no axios/fetch)',
  'JA4/TLS Chrome alignment',
  '30–150ms click-to-request delay',
  'WSS frame logging',
  'Wasm intercept + wasm2wat',
  'Wasm scan: endpoints, keys, crypto',
  'Wasm JS stubs for emulation',
  'Heap snapshot or Runtime fallback',
  'Heap regex: JWT, Bearer, apiKey, secret, hex, base64',
  'Memory Vault UI',
  'Micro-chaos on load',
  'Idle jitter during wait',
  'Integrity hash (V8 primitives)',
  'ASAR integrity (when baseline set)',
  'Halt on integrity mismatch (when env)',
  'macOS font smoothing',
  'macOS retina/color profile',
  'Protocol shadow (NetworkService)',
  'AutomationControlled disabled',
  'Intent-to-execution delay in dom-signal',
  'Wasm decompiled UI + indexed for search',
  'API Sandbox + live metrics',
  'Hidden DOM discovery (≥3 per run)',
];

export default function DeepReconPanel({ wasmDecompiled, heapFindings, wssFrames, hiddenDomFindings = [], onSandboxRequest }: DeepReconPanelProps) {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<'vault' | 'wasm' | 'wss' | 'sandbox' | 'apex'>('vault');
  const [sandboxUrl, setSandboxUrl] = useState('https://httpbin.org/get');
  const [sandboxResult, setSandboxResult] = useState<{ ok?: boolean; error?: string; status?: number; body?: string; durationMs?: number } | null>(null);
  const [sandboxLoading, setSandboxLoading] = useState(false);
  const [wasmSearch, setWasmSearch] = useState('');
  const hiddenOk = hiddenDomFindings.length >= 3;

  const runSandbox = async () => {
    setSandboxLoading(true);
    setSandboxResult(null);
    try {
      const r = await onSandboxRequest(sandboxUrl);
      setSandboxResult(r);
    } finally {
      setSandboxLoading(false);
    }
  };

  return (
    <div className="shrink-0 border-b border-slate-800">
      <button onClick={() => setOpen((o) => !o)} className="w-full px-3 py-2 flex items-center gap-2 text-left text-sm text-slate-300 hover:bg-slate-800/50">
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        <Shield className="w-4 h-4 text-amber-400/90" />
        Deep Recon
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          <div className="flex gap-1 flex-wrap">
            {(['vault', 'wasm', 'wss', 'sandbox', 'apex'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`px-2 py-1 text-xs rounded ${tab === t ? 'bg-amber-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
                {t === 'vault' && <Cpu className="w-3 h-3 inline mr-1" />}
                {t === 'wasm' && <FileCode className="w-3 h-3 inline mr-1" />}
                {t === 'wss' && <Radio className="w-3 h-3 inline mr-1" />}
                {t === 'sandbox' && <FlaskConical className="w-3 h-3 inline mr-1" />}
                {t === 'apex' && <CheckCircle className="w-3 h-3 inline mr-1" />}
                {t}
              </button>
            ))}
          </div>

          {tab === 'vault' && (
            <div className="bg-slate-900/80 rounded p-2 max-h-40 overflow-y-auto text-xs font-mono">
              {heapFindings == null ? (
                <span className="text-slate-500">Run View → Probe heap (browser).</span>
              ) : (
                <>
                  <div className="text-slate-400 mb-1">Method: {heapFindings.method} · Strings: {heapFindings.stringsTotal} · Findings: {heapFindings.findings.length}</div>
                  {heapFindings.findings.slice(0, 20).map((f, i) => (
                    <div key={i} className="text-slate-300 truncate" title={f.value}><span className="text-amber-400/90">{f.type}</span> {f.value.slice(0, 80)}{f.value.length > 80 ? '…' : ''}</div>
                  ))}
                </>
              )}
            </div>
          )}

          {tab === 'wasm' && (
            <div className="space-y-2">
              <input type="text" value={wasmSearch} onChange={(e) => setWasmSearch(e.target.value)} placeholder="Search wasm (path, endpoints, keys)…" className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded text-xs text-white placeholder-slate-500" />
              <div className="bg-slate-900/80 rounded p-2 max-h-44 overflow-y-auto text-xs font-mono space-y-2">
                {wasmDecompiled.length === 0 ? (
                  <span className="text-slate-500">Wasm from flows with wasmPath will appear here. All .wasm → .wat and indexed.</span>
                ) : (
                  (() => {
                    const q = wasmSearch.trim().toLowerCase();
                    const list = q ? wasmDecompiled.filter((w) => [w.path, (w.wat||''), ...(w.endpoints||[]), ...(w.keys||[]), ...(w.exportedFuncs||[])].join(' ').toLowerCase().includes(q)) : wasmDecompiled.slice(-5).reverse();
                    return list.map((w, i) => (
                      <div key={i} className="border-b border-slate-700 pb-2">
                        <div className="text-amber-400/90">{w.ok ? w.path : w.error}</div>
                        {w.ok && <><div>Endpoints: {(w.endpoints||[]).slice(0, 3).join(', ')}</div><div>Keys: {(w.keys||[]).length} · Crypto: {(w.crypto||[]).length}</div><pre className="whitespace-pre-wrap break-words mt-1 text-slate-400">{(w.wat||'').slice(0, 400)}…</pre></>}
                      </div>
                    ));
                  })()
                )}
              </div>
            </div>
          )}

          {tab === 'wss' && (
            <div className="bg-slate-900/80 rounded p-2 max-h-40 overflow-y-auto text-xs font-mono space-y-1">
              {wssFrames.length === 0 ? <span className="text-slate-500">WSS frames will appear here.</span> : wssFrames.slice(-15).reverse().map((f, i) => (
                <div key={i} className="truncate"><span className={f.from_client ? 'text-blue-400' : 'text-green-400'}>{f.from_client ? '→' : '←'}</span> {typeof f.content === 'string' ? f.content.slice(0, 100) : '[binary]'}</div>
              ))}
            </div>
          )}

          {tab === 'sandbox' && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input type="url" value={sandboxUrl} onChange={(e) => setSandboxUrl(e.target.value)} placeholder="https://" className="flex-1 px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white" />
                <button onClick={runSandbox} disabled={sandboxLoading} className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded text-xs text-white">Fetch (native)</button>
              </div>
              {sandboxResult && (
                <div className="bg-slate-900/80 rounded p-2 text-xs font-mono">
                  {sandboxResult.ok ? <>Status: {sandboxResult.status} · {sandboxResult.durationMs}ms</> : <>Error: {sandboxResult.error}</>}
                  {sandboxResult.body != null && <pre className="mt-1 max-h-24 overflow-auto text-slate-400 whitespace-pre-wrap break-words">{String(sandboxResult.body).slice(0, 500)}</pre>}
                </div>
              )}
            </div>
          )}

          {tab === 'apex' && (
            <div className="bg-slate-900/80 rounded p-2 max-h-48 overflow-y-auto text-xs space-y-0.5">
              {APEX_CRITERIA.map((c, i) => (
                <div key={i} className="flex items-center gap-2 text-slate-300"><CheckCircle className="w-3 h-3 text-green-500/80 shrink-0" />{c}</div>
              ))}
              <div className="mt-2 pt-2 border-t border-slate-700 text-slate-400">
                Hidden DOM: {hiddenDomFindings.length} (≥3) {hiddenOk ? '✓' : '— run on a page with hidden inputs/data-*.'}
              </div>
              <div className="mt-1 text-slate-400">JA4: verify at tls.peet.ws in browser panel. CreepJS: run in target to validate.</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
