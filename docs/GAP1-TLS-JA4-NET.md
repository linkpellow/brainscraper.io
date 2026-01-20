# Gap 1: TLS & HTTP/2 Fingerprint Alignment (JA4)

## Issue

Node’s `fetch`/`axios` and the `https` module use OpenSSL and produce a different **TLS handshake** and **HTTP/2 frame profile** than Chromium. Anti-bot systems (e.g. Akamai) use **JA4** (and similar) to detect non-browser clients before the first byte of the request body.

## Fix

Use **Electron’s `net` module** for any HTTP(S) or HTTP/2 requests made from the **main process**. `net.request` goes through Chromium’s network stack, so the JA4 (and ALPN, HTTP/2) profile matches a normal Chrome session.

## When to use

- **Left-panel (target) browser**: Already uses Chromium’s net via `WebContentsView` + `session` — no change.
- **Main process**: Any call to a target domain (or any domain you want to look “like Chrome”) must use `fetchViaChromium` (or `net.request`) instead of `fetch`/`axios`/`https`.

## API

```ts
import { net } from 'electron';

export function fetchViaChromium(
  url: string,
  opts?: { method?: string; headers?: Record<string, string>; body?: string }
): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  return new Promise((resolve, reject) => {
    const r = net.request({
      method: opts?.method || 'GET',
      url,
      useSessionCookies: true, // optional: use a specific session
    });
    if (opts?.headers) {
      for (const [k, v] of Object.entries(opts.headers)) r.setHeader(k, v);
    }
    r.on('response', (res) => {
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(res.headers)) {
        headers[k.toLowerCase()] = Array.isArray(v) ? v[v.length - 1] : String(v);
      }
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers, body }));
      res.on('error', reject);
    });
    r.on('error', reject);
    if (opts?.body) r.write(opts.body);
    r.end();
  });
}
```

- For a **proxied** request (e.g. through mitmproxy), create a `session` with `setProxy` and pass it:  
  `net.request({ ..., session: proxiedSession })`.

## References

- [Electron `net.request`](https://www.electronjs.org/docs/latest/api/net#netrequestoptions)
- [JA4](https://github.com/FoxIO-LLC/ja4) and related TLS fingerprinting.
