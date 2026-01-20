/**
 * Heap String Miner — Deep Recon
 *
 * Uses CDP HeapProfiler.takeHeapSnapshot to collect chunks, parses strings,
 * and applies regex for tokens/credentials. Fallback: Runtime.evaluate
 * broad window dump if snapshot fails.
 *
 * Edge cases: debugger already attached, snapshot timeout, huge heaps,
 * malformed chunks, empty strings, duplicate findings. All handled.
 */

import type { WebContents } from 'electron';

const HEAP_SNAPSHOT_TIMEOUT_MS = 60_000;
const MAX_STRINGS_SCAN = 100_000;
const FALLBACK_DEPTH = 3;
const FALLBACK_PROP_LIMIT = 50;

export type HeapFinding = {
  type: 'jwt' | 'bearer' | 'apikey' | 'secret' | 'hex' | 'base64' | 'generic';
  value: string;
  hint: string;
};

export type HeapMinerResult = {
  ok: boolean;
  method: 'HeapProfiler' | 'Runtime.evaluate';
  error?: string;
  stringsTotal: number;
  findings: HeapFinding[];
  sample: string[];
};

/** JWT: three base64url segments */
const JWT_REGEX = /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
/** Bearer */
const BEARER_REGEX = /Bearer\s+[A-Za-z0-9_.-]{20,}/gi;
/** apiKey, api_key, x-api-key value-like */
const APIKEY_REGEX = /(?:api[_-]?key|apikey|x-api-key)["\s:=]+["']?([A-Za-z0-9_-]{16,})["']?/gi;
/** secret, password, token value-like */
const SECRET_REGEX = /(?:secret|password|token|auth|credential)["\s:=]+["']?([^\s"']{12,})["']?/gi;
/** long hex (e.g. 32+ chars) */
const HEX_REGEX = /\b[a-fA-F0-9]{32,}\b/g;
/** base64 block */
const B64_REGEX = /[A-Za-z0-9+/]{40,}={0,2}/g;

function collectFindings(str: string): HeapFinding[] {
  const out: HeapFinding[] = [];
  const seen = new Set<string>();

  function add(type: HeapFinding['type'], value: string, hint: string) {
    const v = value.slice(0, 256);
    if (seen.has(v)) return;
    seen.add(v);
    out.push({ type, value: v, hint });
  }

  let m: RegExpExecArray | null;
  JWT_REGEX.lastIndex = 0;
  while ((m = JWT_REGEX.exec(str)) !== null) add('jwt', m[0], 'JWT-like');
  BEARER_REGEX.lastIndex = 0;
  while ((m = BEARER_REGEX.exec(str)) !== null) add('bearer', m[0], 'Bearer token');
  APIKEY_REGEX.lastIndex = 0;
  while ((m = APIKEY_REGEX.exec(str)) !== null) add('apikey', m[1] || m[0], 'apiKey-like');
  SECRET_REGEX.lastIndex = 0;
  while ((m = SECRET_REGEX.exec(str)) !== null) add('secret', m[1] || m[0], 'secret/password-like');
  HEX_REGEX.lastIndex = 0;
  while ((m = HEX_REGEX.exec(str)) !== null) {
    if (m[0].length >= 32) add('hex', m[0], 'long hex');
  }
  B64_REGEX.lastIndex = 0;
  while ((m = B64_REGEX.exec(str)) !== null) {
    if (m[0].length >= 40) add('base64', m[0], 'base64 block');
  }

  return out;
}

/**
 * Extract string array from V8 heap snapshot. Chunks may concatenate to JSON
 * with "strings":["a","b",...]. Fallback: all double-quoted strings in blob.
 */
function extractStringsFromSnapshot(jsonText: string): string[] {
  const arr: string[] = [];
  try {
    const o = JSON.parse(jsonText) as { strings?: string[]; snapshot?: { strings?: string[] } };
    if (Array.isArray(o.strings)) arr.push(...o.strings);
    if (o.snapshot && Array.isArray((o.snapshot as { strings?: string[] }).strings)) {
      arr.push(...(o.snapshot as { strings: string[] }).strings);
    }
  } catch {
    const quoted = jsonText.match(/"((?:[^"\\]|\\.)*)"/g);
    if (quoted) {
      for (const p of quoted) {
        try {
          const s = JSON.parse(p) as unknown;
          if (typeof s === 'string' && s.length >= 4 && s.length <= 10000) arr.push(s);
        } catch { /* skip */ }
      }
    }
  }
  return arr;
}

/**
 * CDP HeapProfiler.takeHeapSnapshot: collect chunks from debugger message events.
 */
export async function takeHeapSnapshotWithCDP(wc: WebContents): Promise<HeapMinerResult> {
  const chunks: string[] = [];
  let resolved = false;

  const onMessage = (_e: unknown, method: string, params: { chunk?: string }) => {
    if (method === 'HeapProfiler.addHeapSnapshotChunk' && typeof params?.chunk === 'string') {
      chunks.push(params.chunk);
    }
  };

  const onMessageWrapper = (_e: unknown, method: unknown, params: unknown) => {
    onMessage(_e, method as string, params as { chunk?: string });
  };

  try {
    (wc.debugger as unknown as { on(event: string, cb: (...a: unknown[]) => void): void }).on('message', onMessageWrapper);
  } catch {
    return {
      ok: false,
      method: 'HeapProfiler',
      error: 'Debugger message listener not supported',
      stringsTotal: 0,
      findings: [],
      sample: [],
    };
  }

  const cleanup = () => {
    try {
      (wc.debugger as unknown as { off(event: string, cb: (...a: unknown[]) => void): void }).off('message', onMessageWrapper);
    } catch { /* ignore */ }
  };

  try {
    await (wc.debugger as unknown as { attach(version?: string): Promise<void> }).attach('1.3');
  } catch (e) {
    cleanup();
    return {
      ok: false,
      method: 'HeapProfiler',
      error: `Debugger attach failed: ${(e as Error).message}`,
      stringsTotal: 0,
      findings: [],
      sample: [],
    };
  }

  const full = await Promise.race([
    new Promise<string>((resolve) => {
      const run = () => {
        (wc.debugger as { sendCommand(m: string, p?: object): Promise<unknown> })
          .sendCommand('HeapProfiler.takeHeapSnapshot')
          .then(() => {
            setTimeout(() => {
              if (!resolved) {
                resolved = true;
                resolve(chunks.join(''));
              }
            }, 500);
          })
          .catch(() => {
            if (!resolved) {
              resolved = true;
              resolve(chunks.join(''));
            }
          });
      };
      run();
    }),
    new Promise<string>((_, rej) =>
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          rej(new Error(`Heap snapshot timeout after ${HEAP_SNAPSHOT_TIMEOUT_MS}ms`));
        }
      }, HEAP_SNAPSHOT_TIMEOUT_MS)
    ),
  ]).catch((e) => {
    throw e;
  });

  try {
    await (wc.debugger as unknown as { detach(): Promise<void> }).detach();
  } catch { /* ignore */ }
  cleanup();

  const strings = extractStringsFromSnapshot(full).filter((s) => typeof s === 'string' && s.length > 0);
  const toScan = strings.slice(0, MAX_STRINGS_SCAN);
  const findings: HeapFinding[] = [];
  for (const s of toScan) {
    findings.push(...collectFindings(s));
  }
  const uniqFindings = Array.from(
    new Map(findings.map((f) => [`${f.type}:${f.value.slice(0, 80)}`, f])).values()
  );

  return {
    ok: true,
    method: 'HeapProfiler',
    stringsTotal: strings.length,
    findings: uniqFindings,
    sample: strings.filter((s) => s.length >= 8 && s.length <= 200).slice(0, 50),
  };
}

const FALLBACK_SCRIPT = `
(function(depth, propLimit) {
  var out = [];
  var seen = new Set();
  function dig(o, d) {
    if (d <= 0 || !o || typeof o !== 'object') return;
    try {
      var keys = Object.keys(o);
      for (var i = 0; i < Math.min(keys.length, propLimit); i++) {
        var k = keys[i];
        var v = o[k];
        if (typeof v === 'string' && v.length >= 12 && v.length <= 2000) {
          var key = k + ':' + v.slice(0, 60);
          if (!seen.has(key)) { seen.add(key); out.push(v); }
        } else if (v && typeof v === 'object' && d > 1) dig(v, d - 1);
      }
    } catch(e) {}
  }
  var roots = ['__INITIAL_STATE__','__NEXT_DATA__','__NUXT__','gapi','__REACT_DEVTOOLS_GLOBAL_HOOK__','window','__APOLLO','dataLayer','__REDUX','wpApiSettings','_wpData','NEXT_DATA','__CONFIG','config','env','__env','settings','__data','state','store','auth','user','session','token','api','__STATE','runtimeConfig','publicRuntimeConfig','serverRuntimeConfig'];
  for (var i = 0; i < roots.length; i++) {
    try { var r = typeof window !== 'undefined' ? window[roots[i]] : (typeof globalThis !== 'undefined' ? globalThis[roots[i]] : null); if (r) dig(r, depth); } catch(e) {}
  }
  return JSON.stringify(out);
})(${FALLBACK_DEPTH}, ${FALLBACK_PROP_LIMIT});
`;

/**
 * Fallback: Runtime.evaluate to dump common globals' string properties.
 */
export async function heapMineWithRuntime(wc: WebContents): Promise<HeapMinerResult> {
  try {
    await (wc.debugger as unknown as { attach(v?: string): Promise<void> }).attach('1.3');
  } catch (e) {
    return {
      ok: false,
      method: 'Runtime.evaluate',
      error: `Debugger attach: ${(e as Error).message}`,
      stringsTotal: 0,
      findings: [],
      sample: [],
    };
  }

  let res: HeapMinerResult;
  try {
    const r = await (wc.debugger as unknown as { sendCommand(m: string, p?: object): Promise<{ result?: { value?: string } }> })
      .sendCommand('Runtime.evaluate', { expression: FALLBACK_SCRIPT });
    const raw = r?.result?.value;
    const arr: string[] = typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return []; } })() : [];
    const findings: HeapFinding[] = [];
    for (const s of arr) findings.push(...collectFindings(String(s)));
    const uniqFindings = Array.from(new Map(findings.map((f) => [`${f.type}:${f.value.slice(0, 80)}`, f])).values());
    res = {
      ok: true,
      method: 'Runtime.evaluate',
      stringsTotal: arr.length,
      findings: uniqFindings,
      sample: arr.slice(0, 50),
    };
  } catch (e) {
    res = {
      ok: false,
      method: 'Runtime.evaluate',
      error: (e as Error).message,
      stringsTotal: 0,
      findings: [],
      sample: [],
    };
  }
  try {
    await (wc.debugger as unknown as { detach(): Promise<void> }).detach();
  } catch { /* ignore */ }
  return res;
}

/**
 * Run heap miner: try HeapProfiler first, then Runtime.evaluate fallback.
 */
export async function runHeapMiner(wc: WebContents): Promise<HeapMinerResult> {
  if (!wc || wc.isDestroyed()) {
    return { ok: false, method: 'HeapProfiler', error: 'WebContents invalid or destroyed', stringsTotal: 0, findings: [], sample: [] };
  }
  const snap = await takeHeapSnapshotWithCDP(wc);
  if (snap.ok && (snap.stringsTotal > 0 || snap.findings.length > 0)) return snap;
  return heapMineWithRuntime(wc);
}
