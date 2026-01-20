/**
 * Anti-bot audit — validation hooks and assertions.
 * Run: npx vitest run utils/__tests__/anti-bot-audit.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  assertIntentDelayInRange,
  getIntentDelayConfigured,
  computeLinearityScore,
  assertLinearityScore,
  assertTremorAmplitudeInRange,
  TREMOR_AMP_PX,
  LINEARITY_THRESHOLD,
  computeClickCorrelationRatio,
  assertHiddenDomCount,
  searchWasmIndex,
  INTENT_DELAY_MS,
} from '../stealth/anti-bot-audit';

describe('Protocol & Network', () => {
  it('intent delay configured 30–150ms', () => {
    const { min, max } = getIntentDelayConfigured();
    expect(min).toBe(30);
    expect(max).toBe(149);
  });

  it('assertIntentDelayInRange passes for [30,149]', () => {
    const r = assertIntentDelayInRange(30, 149);
    expect(r.pass).toBe(true);
  });

  it('assertIntentDelayInRange fails for [0,200]', () => {
    const r = assertIntentDelayInRange(0, 200);
    expect(r.pass).toBe(false);
  });
});

describe('Biological Fidelity', () => {
  it('computeLinearityScore: zigzag path has low R² (curved/non-linear)', () => {
    const zigzag = [0, 1, 2, 3, 4, 5].map((i) => ({ x: i, y: i % 2 === 0 ? 0 : 4 }));
    const score = computeLinearityScore(zigzag);
    expect(score).toBeLessThan(LINEARITY_THRESHOLD);
  });

  it('computeLinearityScore: straight line has high R²', () => {
    const straight = [0, 1, 2, 3, 4, 5].map((i) => ({ x: i, y: i }));
    const score = computeLinearityScore(straight);
    expect(score).toBeGreaterThan(0.9);
  });

  it('assertLinearityScore accepts curved', () => {
    const r = assertLinearityScore(0.1);
    expect(r.pass).toBe(true);
  });

  it('assertTremorAmplitudeInRange: 0.15 in [0.08,0.26]', () => {
    const r = assertTremorAmplitudeInRange(0.15);
    expect(r.pass).toBe(true);
  });

  it('assertTremorAmplitudeInRange: 0.5 fails', () => {
    const r = assertTremorAmplitudeInRange(0.5);
    expect(r.pass).toBe(false);
  });

  it('TREMOR_AMP_PX matches spec', () => {
    expect(TREMOR_AMP_PX.min).toBe(0.08);
    expect(TREMOR_AMP_PX.max).toBe(0.26);
  });
});

describe('Intelligence & Mapping', () => {
  it('computeClickCorrelationRatio', () => {
    const actions = [
      { ts: 100, linkedEventIds: ['e1'] },
      { ts: 200, linkedEventIds: [] },
      { ts: 300, linkedEventIds: ['e2'] },
    ];
    const { ratio, linked, total } = computeClickCorrelationRatio(actions);
    expect(total).toBe(3);
    expect(linked).toBe(2);
    expect(ratio).toBeCloseTo(2 / 3);
  });

  it('assertHiddenDomCount: 3 passes', () => {
    const r = assertHiddenDomCount([{ type: 'a' }, { type: 'b' }, { type: 'c' }], 3);
    expect(r.pass).toBe(true);
  });

  it('assertHiddenDomCount: 2 fails when min 3', () => {
    const r = assertHiddenDomCount([{ type: 'a' }, { type: 'b' }], 3);
    expect(r.pass).toBe(false);
  });

  it('searchWasmIndex finds by path', () => {
    const idx = new Map([
      ['/a.wasm', { path: '/a.wasm', endpoints: ['/api'], keys: [], crypto: [], exportedFuncs: [] }],
      ['/b.wasm', { path: '/b.wasm', endpoints: [], keys: ['x'], crypto: [], exportedFuncs: [] }],
    ]);
    const out = searchWasmIndex(idx, 'api');
    expect(out).toHaveLength(1);
    expect(out[0].path).toBe('/a.wasm');
  });
});
