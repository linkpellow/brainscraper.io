/**
 * Gap 1: TLS & HTTP/2 (JA4) alignment.
 * Use Electron's net.request for main-process HTTP so the TLS handshake
 * matches Chromium. Do not use Node fetch/axios for target APIs.
 */

import { net } from 'electron';
import type { Session } from 'electron';

export function fetchViaChromium(
  url: string,
  opts?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    session?: Session;
  }
): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  return new Promise((resolve, reject) => {
    const options: Electron.ClientRequestConstructorOptions = {
      method: opts?.method || 'GET',
      url,
    };
    if (opts?.session) options.session = opts.session;

    const r = net.request(options);

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
      res.on('end', () => resolve({ status: res.statusCode, headers, body }));
      res.on('error', (e) => reject(e));
    });
    r.on('error', (e) => reject(e));

    if (opts?.body != null) r.write(opts.body);
    r.end();
  });
}
