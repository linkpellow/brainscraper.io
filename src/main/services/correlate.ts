/**
 * Neural Correlation Engine — "Brain" for DOM action ↔ API request mapping.
 *
 * - Listens for SIGNAL_DOM_ACTION (from preload) and for events_batch (from mitmproxy via bridge).
 * - 2000 ms window: any request that begins in [t, t+2000) is linked.
 * - If multiple: prioritize URL/payload containing keywords from the element's text/id.
 * - Persists links to data/neuromap-links.json.
 */

import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export type DomAction = {
  xpath: string;
  selector: string;
  timestamp: number;
  text?: string;
  id?: string;
  name?: string;
  visibility?: { display?: string | null; visibility?: string | null; opacity?: string | null; offsetParent?: boolean } | null;
  rect?: { left: number; top: number; width: number; height: number } | null;
};

export type NetworkFlow = {
  ts: number;
  method: string;
  url: string;
  status?: number;
  reqHeaders?: Record<string, string>;
  resHeaders?: Record<string, string>;
  reqBodySize?: number;
  resBodySize?: number;
  resMime?: string;
  durationMs?: number;
  reqBody?: string;
  resBody?: string;
};

export type LinkEntry = {
  id: string;
  domAction: DomAction;
  linkedFlows: NetworkFlow[];
  chosenIndex: number;
  chosen: NetworkFlow | null;
  ts: number;
};

export type NeuralCorrelateOpts = {
  storePath?: string;
  windowMs?: number;
  onLinked?: (link: LinkEntry) => void;
};

const DEFAULT_STORE = 'data/neuromap-links.json';
const WINDOW_MS = 2000;

function extractKeywords(text: string | undefined, id: string | undefined): string[] {
  const raw = [text || '', id || ''].join(' ');
  return raw
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter((s) => s.length >= 2)
    .map((s) => s.toLowerCase());
}

function scoreFlow(flow: NetworkFlow, keywords: string[]): number {
  if (keywords.length === 0) return 0;
  const search = [flow.url, flow.reqBody || '', flow.resBody || ''].join(' ').toLowerCase();
  let score = 0;
  for (const k of keywords) {
    if (search.includes(k)) score += 1;
  }
  return score / keywords.length;
}

function loadStore(p: string): LinkEntry[] {
  if (!existsSync(p)) return [];
  try {
    const raw = readFileSync(p, 'utf-8');
    const j = JSON.parse(raw);
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

function appendToStore(p: string, entry: LinkEntry): void {
  const dir = path.dirname(p);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const arr = loadStore(p);
  arr.push(entry);
  writeFileSync(p, JSON.stringify(arr, null, 2), 'utf-8');
}

export class NeuralCorrelate {
  private readonly storePath: string;
  private readonly windowMs: number;
  private readonly onLinked?: (link: LinkEntry) => void;
  private flowBuffer: NetworkFlow[] = [];
  private readonly bufferMax = 2000;
  private readonly bufferWindowMs = 5 * 60 * 1000;

  constructor(opts: NeuralCorrelateOpts = {}) {
    this.storePath = path.resolve(process.cwd(), opts.storePath || DEFAULT_STORE);
    this.windowMs = opts.windowMs ?? WINDOW_MS;
    this.onLinked = opts.onLinked;
  }

  ingestFlows(flows: NetworkFlow[]): void {
    const now = Date.now();
    for (const f of flows) {
      this.flowBuffer.push(f);
    }
    // Prune old
    const cutoff = now - this.bufferWindowMs;
    this.flowBuffer = this.flowBuffer.filter((f) => f.ts >= cutoff).slice(-this.bufferMax);
  }

  ingestDomAction(dom: DomAction): void {
    const t0 = dom.timestamp;
    const t1 = t0 + this.windowMs;
    const candidates = this.flowBuffer.filter((f) => f.ts >= t0 && f.ts < t1);

    const keywords = extractKeywords(dom.text, dom.id);
    const scored = candidates.map((f, i) => ({ flow: f, i, s: scoreFlow(f, keywords) }));
    scored.sort((a, b) => b.s - a.s);

    const chosenIndex = scored.length > 0 ? scored[0].i : -1;
    const chosen = scored.length > 0 ? scored[0].flow : null;

    const link: LinkEntry = {
      id: `link_${dom.timestamp}_${Math.random().toString(36).slice(2, 10)}`,
      domAction: dom,
      linkedFlows: candidates,
      chosenIndex,
      chosen,
      ts: Date.now(),
    };

    appendToStore(this.storePath, link);
    this.onLinked?.(link);
  }
}
