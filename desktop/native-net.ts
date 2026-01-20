/**
 * Network Ghost — JA4 & TLS (desktop, inlined)
 * All HTTP via Chromium net; never axios/Node fetch.
 */

import { net, app } from 'electron';
import type { Session } from 'electron';

export type NativeNetRequestOptions = { method?: string; headers?: Record<string, string>; body?: string; session?: Session; timeoutMs?: number };
export type NativeNetResponse = { status: number; headers: Record<string, string>; body: string; finalUrl?: string };

export function request(url: string, opts?: NativeNetRequestOptions): Promise<NativeNetResponse> {
  return new Promise((resolve, reject) => {
    const options: Electron.ClientRequestConstructorOptions = { method: opts?.method || 'GET', url };
    if (opts?.session) options.session = opts.session;
    const r = net.request(options);
    const to = opts?.timeoutMs ? setTimeout(() => { r.abort(); reject(new Error(`Timeout ${opts!.timeoutMs}ms`)); }, opts.timeoutMs) : null;
    if (opts?.headers) for (const [k, v] of Object.entries(opts.headers)) r.setHeader(k, v);
    r.on('response', (res) => {
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(res.headers)) { const val = Array.isArray(v) ? v[v.length - 1] : v; if (val != null) headers[k.toLowerCase()] = String(val); }
      let body = '';
      res.on('data', (chunk: Buffer) => { body += chunk.toString('utf-8'); });
      res.on('end', () => { if (to) clearTimeout(to); resolve({ status: res.statusCode ?? 0, headers, body, finalUrl: url }); });
      res.on('error', (e) => { if (to) clearTimeout(to); reject(e); });
    });
    r.on('error', (e) => { if (to) clearTimeout(to); reject(e); });
    if (opts?.body != null) r.write(opts.body);
    r.end();
  });
}

export async function fetchViaChromium(url: string, opts?: { method?: string; headers?: Record<string, string>; body?: string; session?: Session; timeoutMs?: number }): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  const res = await request(url, opts);
  return { status: res.status, headers: res.headers, body: res.body };
}

export function applyProtocolShadow(): void {
  app.commandLine.appendSwitch('--enable-features', 'NetworkService,NetworkServiceInProcess');
  app.commandLine.appendSwitch('--disable-features', 'OutOfBlinkCors');
}
