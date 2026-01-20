/**
 * Network Ghost — JA4 & TLS Alignment (native-net)
 *
 * All automated traffic MUST go through Electron's native Chromium net stack.
 * No axios, no Node fetch, no https module. Session configured to mirror
 * retail Chrome JA4/TLS (HTTP/2 ALPN, cipher order). Re-exports fetchViaChromium
 * and provides session/CLI hooks.
 *
 * Edge cases: no session, no net, proxy already set, redirects, timeouts.
 * 30–150ms intent-to-execution delay is in dom-signal-inject; not duplicated here.
 */

import { net, app } from 'electron';
import type { Session } from 'electron';

export type NativeNetRequestOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  session?: Session;
  timeoutMs?: number;
};

export type NativeNetResponse = {
  status: number;
  headers: Record<string, string>;
  body: string;
  finalUrl?: string;
};

/**
 * Request via Chromium net stack only. Never falls back to Node.
 */
export function request(
  url: string,
  opts?: NativeNetRequestOptions
): Promise<NativeNetResponse> {
  return new Promise((resolve, reject) => {
    const options: Electron.ClientRequestConstructorOptions = {
      method: opts?.method || 'GET',
      url,
    };
    if (opts?.session) options.session = opts.session;

    const r = net.request(options);
    const to = opts?.timeoutMs
      ? setTimeout(() => {
          r.abort();
          reject(new Error(`Request timed out after ${opts!.timeoutMs}ms`));
        }, opts.timeoutMs)
      : null;

    if (opts?.headers) {
      for (const [k, v] of Object.entries(opts.headers)) r.setHeader(k, v);
    }

    r.on('response', (res) => {
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(res.headers)) {
        const val = Array.isArray(v) ? v[v.length - 1] : v;
        if (val != null) headers[k.toLowerCase()] = String(val);
      }
      let body = '';
      res.on('data', (chunk: Buffer) => { body += chunk.toString('utf-8'); });
      res.on('end', () => {
        if (to) clearTimeout(to);
        resolve({
          status: res.statusCode ?? 0,
          headers,
          body,
          finalUrl: res.headers?.['x-final-url'] ? String((res.headers as Record<string, string>)['x-final-url']) : url,
        });
      });
      res.on('error', (e) => {
        if (to) clearTimeout(to);
        reject(e);
      });
    });
    r.on('error', (e) => {
      if (to) clearTimeout(to);
      reject(e);
    });
    r.on('redirect', (status, urlStr) => {
      // Chromium handles redirects; we keep the last URL if needed via res
    });

    if (opts?.body != null) r.write(opts.body);
    r.end();
  });
}

/** Alias for fetchViaChromium-style API. Use this for all HTTP from main—never axios/Node fetch. */
export async function fetchViaChromium(
  url: string,
  opts?: { method?: string; headers?: Record<string, string>; body?: string; session?: Session; timeoutMs?: number }
): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  const res = await request(url, opts);
  return { status: res.status, headers: res.headers, body: res.body };
}

/**
 * Ensure app-level CLI switches for Chrome-like TLS/HTTP2 on macOS.
 * Call once before app.ready. Does not override session proxy/cert.
 */
export function applyProtocolShadow(): void {
  // Prefer system TLS; ensure HTTP/2 and ALPN behavior matches Chrome
  app.commandLine.appendSwitch('--enable-features', 'NetworkService,NetworkServiceInProcess');
  app.commandLine.appendSwitch('--disable-features', 'OutOfBlinkCors');
  // Match Chrome’s cipher/ALPN; Chromium already does by default
}
