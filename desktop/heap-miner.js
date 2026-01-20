"use strict";
/**
 * Heap String Miner — Deep Recon (desktop, inlined)
 * CDP HeapProfiler.takeHeapSnapshot + Runtime.evaluate fallback.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.takeHeapSnapshotWithCDP = takeHeapSnapshotWithCDP;
exports.heapMineWithRuntime = heapMineWithRuntime;
exports.runHeapMiner = runHeapMiner;
const HEAP_SNAPSHOT_TIMEOUT_MS = 60_000;
const MAX_STRINGS_SCAN = 100_000;
const FALLBACK_DEPTH = 3;
const FALLBACK_PROP_LIMIT = 50;
const JWT_REGEX = /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const BEARER_REGEX = /Bearer\s+[A-Za-z0-9_.-]{20,}/gi;
const APIKEY_REGEX = /(?:api[_-]?key|apikey|x-api-key)["\s:=]+["']?([A-Za-z0-9_-]{16,})["']?/gi;
const SECRET_REGEX = /(?:secret|password|token|auth|credential)["\s:=]+["']?([^\s"']{12,})["']?/gi;
const HEX_REGEX = /\b[a-fA-F0-9]{32,}\b/g;
const B64_REGEX = /[A-Za-z0-9+/]{40,}={0,2}/g;
function collectFindings(str) {
    const out = [];
    const seen = new Set();
    function add(t, v, h) { const x = v.slice(0, 256); if (seen.has(x))
        return; seen.add(x); out.push({ type: t, value: x, hint: h }); }
    let m;
    JWT_REGEX.lastIndex = 0;
    while ((m = JWT_REGEX.exec(str)) !== null)
        add('jwt', m[0], 'JWT-like');
    BEARER_REGEX.lastIndex = 0;
    while ((m = BEARER_REGEX.exec(str)) !== null)
        add('bearer', m[0], 'Bearer');
    APIKEY_REGEX.lastIndex = 0;
    while ((m = APIKEY_REGEX.exec(str)) !== null)
        add('apikey', m[1] || m[0], 'apiKey-like');
    SECRET_REGEX.lastIndex = 0;
    while ((m = SECRET_REGEX.exec(str)) !== null)
        add('secret', m[1] || m[0], 'secret-like');
    HEX_REGEX.lastIndex = 0;
    while ((m = HEX_REGEX.exec(str)) !== null) {
        if (m[0].length >= 32)
            add('hex', m[0], 'long hex');
    }
    B64_REGEX.lastIndex = 0;
    while ((m = B64_REGEX.exec(str)) !== null) {
        if (m[0].length >= 40)
            add('base64', m[0], 'base64');
    }
    return out;
}
function extractStringsFromSnapshot(jsonText) {
    const arr = [];
    try {
        const o = JSON.parse(jsonText);
        if (Array.isArray(o.strings))
            arr.push(...o.strings);
        if (o.snapshot && Array.isArray(o.snapshot.strings))
            arr.push(...o.snapshot.strings);
    }
    catch {
        const quoted = jsonText.match(/"((?:[^"\\]|\\.)*)"/g);
        if (quoted)
            for (const p of quoted) {
                try {
                    const s = JSON.parse(p);
                    if (typeof s === 'string' && s.length >= 4 && s.length <= 10000)
                        arr.push(s);
                }
                catch { /* skip */ }
            }
    }
    return arr;
}
async function takeHeapSnapshotWithCDP(wc) {
    const chunks = [];
    const onMessage = (_e, method, params) => { if (method === 'HeapProfiler.addHeapSnapshotChunk' && typeof params?.chunk === 'string')
        chunks.push(params.chunk); };
    const dbg = wc.debugger;
    try {
        dbg.on('message', onMessage);
    }
    catch {
        return { ok: false, method: 'HeapProfiler', error: 'Debugger message not supported', stringsTotal: 0, findings: [], sample: [] };
    }
    const cleanup = () => { try {
        dbg.off('message', onMessage);
    }
    catch { /* ignore */ } };
    try {
        await dbg.attach('1.3');
    }
    catch (e) {
        cleanup();
        return { ok: false, method: 'HeapProfiler', error: String(e.message), stringsTotal: 0, findings: [], sample: [] };
    }
    let full = '';
    try {
        await dbg.sendCommand('HeapProfiler.takeHeapSnapshot');
        await new Promise((r) => setTimeout(r, 800));
        full = chunks.join('');
    }
    catch {
        full = chunks.join('');
    }
    try {
        await dbg.detach();
    }
    catch { /* ignore */ }
    cleanup();
    const strings = extractStringsFromSnapshot(full).filter((s) => typeof s === 'string' && s.length > 0);
    const findings = [];
    for (const s of strings.slice(0, MAX_STRINGS_SCAN))
        findings.push(...collectFindings(s));
    const uniqF = Array.from(new Map(findings.map((f) => [`${f.type}:${f.value.slice(0, 80)}`, f])).values());
    return { ok: true, method: 'HeapProfiler', stringsTotal: strings.length, findings: uniqF, sample: strings.filter((s) => s.length >= 8 && s.length <= 200).slice(0, 50) };
}
const FALLBACK_SCRIPT = `(function(depth, propLimit) { var out = []; var seen = new Set(); function dig(o, d) { if (d <= 0 || !o || typeof o !== 'object') return; try { for (var i = 0; i < Math.min(Object.keys(o).length, propLimit); i++) { var k = Object.keys(o)[i]; var v = o[k]; if (typeof v === 'string' && v.length >= 12 && v.length <= 2000) { var key = k + ':' + v.slice(0, 60); if (!seen.has(key)) { seen.add(key); out.push(v); } } else if (v && typeof v === 'object' && d > 1) dig(v, d - 1); } } catch(e) {} } var roots = ['__INITIAL_STATE__','__NEXT_DATA__','__NUXT__','gapi','__REACT_DEVTOOLS_GLOBAL_HOOK__','__APOLLO','dataLayer','__REDUX','auth','session','token','api','__STATE','config','env','runtimeConfig']; for (var i = 0; i < roots.length; i++) { try { var r = (typeof window !== 'undefined' ? window : globalThis)[roots[i]]; if (r) dig(r, depth); } catch(e) {} } return JSON.stringify(out); })(${FALLBACK_DEPTH}, ${FALLBACK_PROP_LIMIT});`;
async function heapMineWithRuntime(wc) {
    const dbg = wc.debugger;
    try {
        await dbg.attach('1.3');
    }
    catch (e) {
        return { ok: false, method: 'Runtime.evaluate', error: String(e.message), stringsTotal: 0, findings: [], sample: [] };
    }
    let res;
    try {
        const r = await dbg.sendCommand('Runtime.evaluate', { expression: FALLBACK_SCRIPT });
        const arr = typeof r?.result?.value === 'string' ? (() => { try {
            return JSON.parse(r.result.value);
        }
        catch {
            return [];
        } })() : [];
        const findings = [];
        for (const s of arr)
            findings.push(...collectFindings(String(s)));
        res = { ok: true, method: 'Runtime.evaluate', stringsTotal: arr.length, findings: Array.from(new Map(findings.map((f) => [`${f.type}:${f.value.slice(0, 80)}`, f])).values()), sample: arr.slice(0, 50) };
    }
    catch (e) {
        res = { ok: false, method: 'Runtime.evaluate', error: e.message, stringsTotal: 0, findings: [], sample: [] };
    }
    try {
        await dbg.detach();
    }
    catch { /* ignore */ }
    return res;
}
async function runHeapMiner(wc) {
    if (!wc || wc.isDestroyed())
        return { ok: false, method: 'HeapProfiler', error: 'WebContents invalid', stringsTotal: 0, findings: [], sample: [] };
    const snap = await takeHeapSnapshotWithCDP(wc);
    if (snap.ok && (snap.stringsTotal > 0 || snap.findings.length > 0))
        return snap;
    return heapMineWithRuntime(wc);
}
