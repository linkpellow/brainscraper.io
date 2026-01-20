/**
 * Anti-Bot Audit — validation helpers and runtime assertions for a simulated
 * macOS Chrome instance. Use from tests, CI, or a dedicated "Run audit" flow.
 *
 * JA4: verify via https://tls.peet.ws (load in target browser; document result).
 * HTTP/2: we do not override Chromium SETTINGS/HPACK; native stack only.
 */

export const INTENT_DELAY_MS = { min: 30, max: 150 } as const;
export const TREMOR_AMP_PX = { min: 0.08, max: 0.26 } as const;
export const LINEARITY_THRESHOLD = 0.15; // WindMouse paths should have R² < 0.15 (curved)
export const PERFORMANCE_NOW_JITTER_US = 2;

/**
 * 1. Protocol & Network — Intent Delay
 * dom-signal-inject uses: 30 + Math.floor(Math.random() * 120) → [30, 149].
 */
export function assertIntentDelayInRange(actualMin: number, actualMax: number): { pass: boolean; message: string } {
  const ok = actualMin >= INTENT_DELAY_MS.min && actualMax <= INTENT_DELAY_MS.max;
  return {
    pass: ok,
    message: ok ? `Intent delay [${actualMin}, ${actualMax}]ms within [${INTENT_DELAY_MS.min}, ${INTENT_DELAY_MS.max}]` : `Intent delay [${actualMin}, ${actualMax}]ms outside [${INTENT_DELAY_MS.min}, ${INTENT_DELAY_MS.max}]`,
  };
}

/** Configured range in dom-signal (30 + random*120). */
export function getIntentDelayConfigured(): { min: number; max: number } {
  return { min: 30, max: 30 + 120 - 1 };
}

/**
 * 2. Biological — Linearity score of a cursor path.
 * R² of y ~ x (how well points lie on a straight line). Low R² = curved (good for WindMouse).
 * Returns value in [0,1]; we require < LINEARITY_THRESHOLD.
 */
export function computeLinearityScore(points: { x: number; y: number }[]): number {
  if (points.length < 3) return 0;
  const n = points.length;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) ssTot += (ys[i] - meanY) ** 2;
  const slope = xs.reduce((s, x, i) => s + (x - meanX) * (ys[i] - meanY), 0) / Math.max(1e-9, xs.reduce((s, x) => s + (x - meanX) ** 2, 0));
  const intercept = meanY - slope * meanX;
  for (let i = 0; i < n; i++) ssRes += (ys[i] - (intercept + slope * xs[i])) ** 2;
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  return Math.max(0, Math.min(1, r2));
}

export function assertLinearityScore(score: number): { pass: boolean; message: string } {
  const ok = score < LINEARITY_THRESHOLD;
  return { pass: ok, message: `Linearity ${score.toFixed(4)} < ${LINEARITY_THRESHOLD} (curved): ${ok ? 'PASS' : 'FAIL'}` };
}

/**
 * 2. Biological — Micro-tremor amplitude in [0.08, 0.26] px.
 * physics-mouse: amp = 0.08 + 0.18 * rng() → [0.08, 0.26].
 */
export function assertTremorAmplitudeInRange(amp: number): { pass: boolean; message: string } {
  const ok = amp >= TREMOR_AMP_PX.min && amp <= TREMOR_AMP_PX.max;
  return { pass: ok, message: `Tremor amp ${amp.toFixed(3)}px in [${TREMOR_AMP_PX.min}, ${TREMOR_AMP_PX.max}]: ${ok ? 'PASS' : 'FAIL'}` };
}

/**
 * 2. Biological — Fatigue: SessionFatigue scales wind and delay with action count.
 * Cap 60; at ~1 action/15s that’s ~15 min. No extra assertion; document.
 */
export function getFatigueAuditNote(): string {
  return 'SessionFatigue: windScale=1+frate*min(actions,60), delayMuScale=1+drate*min(actions,60). Cap 60 ≈ 15min at 1 action/15s.';
}

/**
 * 5. Intelligence — Click-to-API correlation ratio.
 * linked = actions with at least one linked event; total = actions in window where events exist.
 */
export function computeClickCorrelationRatio(
  actions: { ts: number; linkedEventIds?: string[] }[],
  windowMs: number = 2000
): { ratio: number; linked: number; total: number; message: string } {
  const withLink = actions.filter((a) => a.linkedEventIds && a.linkedEventIds.length > 0);
  const total = actions.length;
  const ratio = total > 0 ? withLink.length / total : 1;
  return {
    ratio,
    linked: withLink.length,
    total,
    message: `Click correlation: ${withLink.length}/${total} = ${(ratio * 100).toFixed(1)}%`,
  };
}

/**
 * 5. Intelligence — Hidden DOM: require at least N assets per run.
 */
export function assertHiddenDomCount(findings: { type: string }[], minCount: number = 3): { pass: boolean; message: string } {
  const ok = findings.length >= minCount;
  return { pass: ok, message: `Hidden DOM assets: ${findings.length} >= ${minCount}: ${ok ? 'PASS' : 'FAIL'}` };
}

/**
 * 5. Intelligence — Wasm: all .wasm → .wat and indexed.
 * Index format: path → { wat, endpoints, keys, exportedFuncs }. Search over concatenated strings.
 */
export type WasmIndexEntry = { path: string; wat?: string; endpoints: string[]; keys: string[]; crypto: string[]; exportedFuncs: string[] };

export function searchWasmIndex(index: Map<string, WasmIndexEntry>, query: string): WasmIndexEntry[] {
  const q = query.toLowerCase();
  const out: WasmIndexEntry[] = [];
  for (const [path, e] of index) {
    const blob = [path, e.wat || '', ...e.endpoints, ...e.keys, ...e.exportedFuncs].join(' ').toLowerCase();
    if (blob.includes(q)) out.push(e);
  }
  return out;
}

/** JA4 / TLS: instructions for tls.peet.ws. No programmatic check; manual. */
export const JA4_VERIFICATION = `
JA4 (TLS fingerprint) verification:
1. In the desktop app, navigate the *browser* (left panel) to https://tls.peet.ws
2. The page shows the JA4 fingerprint of the connection.
3. Compare to a known retail macOS Chrome JA4 (e.g. from another Mac/Chrome).
4. Outbound from the *browser* view uses Chromium's net (Electron) → should match Chrome.
5. Do NOT use Node fetch/axios for that traffic; native net.request only (we comply).
`;

/** HTTP/2: we do not set custom SETTINGS; Chromium defaults. */
export const HTTP2_AUDIT_NOTE = 'HTTP/2: No custom SETTINGS or HPACK overrides. Chromium defaults (connection window, SETTINGS frame) used. applyProtocolShadow only sets NetworkService; it does not change HTTP/2 parameters.';
