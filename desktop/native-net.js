"use strict";
/**
 * Network Ghost — JA4 & TLS (desktop, inlined)
 * All HTTP via Chromium net; never axios/Node fetch.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.request = request;
exports.fetchViaChromium = fetchViaChromium;
exports.applyProtocolShadow = applyProtocolShadow;
const electron_1 = require("electron");
function request(url, opts) {
    return new Promise((resolve, reject) => {
        const options = { method: opts?.method || 'GET', url };
        if (opts?.session)
            options.session = opts.session;
        const r = electron_1.net.request(options);
        const to = opts?.timeoutMs ? setTimeout(() => { r.abort(); reject(new Error(`Timeout ${opts.timeoutMs}ms`)); }, opts.timeoutMs) : null;
        if (opts?.headers)
            for (const [k, v] of Object.entries(opts.headers))
                r.setHeader(k, v);
        r.on('response', (res) => {
            const headers = {};
            for (const [k, v] of Object.entries(res.headers)) {
                const val = Array.isArray(v) ? v[v.length - 1] : v;
                if (val != null)
                    headers[k.toLowerCase()] = String(val);
            }
            let body = '';
            res.on('data', (chunk) => { body += chunk.toString('utf-8'); });
            res.on('end', () => { if (to)
                clearTimeout(to); resolve({ status: res.statusCode ?? 0, headers, body, finalUrl: url }); });
            res.on('error', (e) => { if (to)
                clearTimeout(to); reject(e); });
        });
        r.on('error', (e) => { if (to)
            clearTimeout(to); reject(e); });
        if (opts?.body != null)
            r.write(opts.body);
        r.end();
    });
}
async function fetchViaChromium(url, opts) {
    const res = await request(url, opts);
    return { status: res.status, headers: res.headers, body: res.body };
}
function applyProtocolShadow() {
    electron_1.app.commandLine.appendSwitch('--enable-features', 'NetworkService,NetworkServiceInProcess');
    electron_1.app.commandLine.appendSwitch('--disable-features', 'OutOfBlinkCors');
}
