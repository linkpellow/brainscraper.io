"use strict";
/**
 * Wasm Decompiler Bridge — Deep Recon (desktop, inlined)
 * No Electron deps. wasm2wat (wabt), scan, JS stubs.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveWasmPath = resolveWasmPath;
exports.decompileToWat = decompileToWat;
exports.scanForSecrets = scanForSecrets;
exports.extractExportedFuncs = extractExportedFuncs;
exports.toJavaScriptStubs = toJavaScriptStubs;
exports.runWasmRecon = runWasmRecon;
exports.runWasmReconFromBuffer = runWasmReconFromBuffer;
const child_process_1 = require("child_process");
const promises_1 = require("fs/promises");
const path_1 = __importDefault(require("path"));
const WASM2WAT_TIMEOUT_MS = 30_000;
const WAT_SCAN_MAX_CHARS = 2_000_000;
const ENDPOINT_REGEX = /https?:\/\/[a-zA-Z0-9][-a-zA-Z0-9.]*(?::[0-9]+)?(?:\/[^\s"']*)?|wss?:\/\/[^\s"']+|(?:"|')\/(?:api|v[0-9]+|graphql|ws|auth|oauth)[^\s"']*(?:"|')|(?:\/[\w.-]+){2,}/g;
const KEY_REGEX = /(?:Bearer\s+)[A-Za-z0-9_.-]{20,}|(?:sk_|pk_)[a-zA-Z0-9]{20,}|[A-Za-z0-9+/]{32,}={0,2}|[a-fA-F0-9]{32,}|"(?:api[_-]?key|secret|token|auth|password)"\s*:\s*"[^"]{16,}"/g;
const CRYPTO_REGEX = /(?:i32|i64|f32|f64)\.(?:xor|rotl|rotr|and|or|shl|shr)|(?:import\s+[^"']*"(?:crypto|Crypto|getRandomValues|subtle|encrypt|decrypt|sign|verify|digest|hash|hmac|aes|sha|md5)[^"']*")|(?:^\s*[;(].*?(?:encrypt|decrypt|sign|hash|key|nonce|iv)\b)/gim;
const EXPORT_FUNC_REGEX = /\(export\s+"([^"]+)"\s*\(\s*func\s+/g;
function uniq(arr) { return [...new Set(arr)]; }
function truncate(s, max) { return s.length <= max ? s : s.slice(0, max) + '...[truncated]'; }
async function resolveWasmPath(wasmPath, projectRoot) {
    const candidates = [wasmPath, path_1.default.isAbsolute(wasmPath) ? wasmPath : path_1.default.join(process.cwd(), wasmPath)];
    if (projectRoot) {
        candidates.push(path_1.default.join(projectRoot, wasmPath));
        candidates.push(path_1.default.join(projectRoot, 'wasm-captures', path_1.default.basename(wasmPath)));
    }
    for (const p of candidates) {
        try {
            await (0, promises_1.access)(p);
            return p;
        }
        catch { /* skip */ }
    }
    return null;
}
async function decompileToWat(wasmPath) {
    return new Promise((resolve) => {
        let stderr = '', stdout = '';
        const proc = (0, child_process_1.spawn)('wasm2wat', [wasmPath], { stdio: ['ignore', 'pipe', 'pipe'] });
        const to = setTimeout(() => { try {
            proc.kill('SIGKILL');
        }
        catch { /* ignore */ } resolve({ error: `wasm2wat timed out after ${WASM2WAT_TIMEOUT_MS}ms` }); }, WASM2WAT_TIMEOUT_MS);
        proc.stdout?.on('data', (d) => { stdout += d.toString('utf-8'); });
        proc.stderr?.on('data', (d) => { stderr += d.toString('utf-8'); });
        proc.on('error', (e) => { clearTimeout(to); resolve({ error: `wasm2wat not found: ${e.message}. Install wabt: brew install wabt` }); });
        proc.on('close', (code, sig) => {
            clearTimeout(to);
            if (code !== 0 && sig !== 'SIGKILL') {
                resolve({ error: `wasm2wat exited ${code}: ${truncate(stderr || stdout, 500)}` });
                return;
            }
            if (!stdout || !stdout.trim()) {
                resolve({ error: 'wasm2wat produced no output' });
                return;
            }
            resolve({ wat: stdout });
        });
    });
}
function scanForSecrets(wat) {
    const s = wat.length > WAT_SCAN_MAX_CHARS ? wat.slice(0, WAT_SCAN_MAX_CHARS) : wat;
    return {
        endpoints: uniq((s.match(ENDPOINT_REGEX) || []).map((x) => x.replace(/^["']|["']$/g, '').trim()).filter(Boolean)),
        keys: uniq((s.match(KEY_REGEX) || []).map((x) => truncate(x, 120)).filter(Boolean)),
        crypto: uniq((s.match(CRYPTO_REGEX) || []).map((x) => x.trim()).filter(Boolean).slice(0, 100)),
    };
}
function extractExportedFuncs(wat) { return uniq(Array.from(wat.matchAll(EXPORT_FUNC_REGEX), (x) => x[1])); }
function toJavaScriptStubs(exportedFuncs, endpoints, keys) {
    const lines = ['// Generated by wasm-recon. Replace bodies with actual logic.', '// Endpoints: ' + endpoints.slice(0, 10).join(', '), '// Keys: ' + keys.slice(0, 5).map((k) => truncate(k, 40)).join(', '), ''];
    for (const name of exportedFuncs) {
        const safe = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name) ? name : `['${name.replace(/'/g, "\\'")}']`;
        lines.push(`export function ${safe}(...args) { throw new Error('Stub: ${name}'); }`, '');
    }
    if (exportedFuncs.length === 0)
        lines.push('// No exported functions found.');
    return lines.join('\n');
}
async function runWasmRecon(wasmPath, opts) {
    const resolved = await resolveWasmPath(wasmPath, opts?.projectRoot);
    if (!resolved)
        return { ok: false, path: wasmPath, url: opts?.url, error: `wasm file not found: ${wasmPath}`, endpoints: [], keys: [], crypto: [], exportedFuncs: [], jsStubs: '' };
    const decomp = await decompileToWat(resolved);
    if ('error' in decomp)
        return { ok: false, path: resolved, url: opts?.url, error: decomp.error, endpoints: [], keys: [], crypto: [], exportedFuncs: [], jsStubs: '' };
    const wat = decomp.wat;
    const { endpoints, keys, crypto } = scanForSecrets(wat);
    const exportedFuncs = extractExportedFuncs(wat);
    return {
        ok: true, path: resolved, url: opts?.url,
        wat: wat.length > WAT_SCAN_MAX_CHARS ? wat.slice(0, WAT_SCAN_MAX_CHARS) + '\n...[truncated]' : wat,
        watLength: wat.length, endpoints, keys, crypto, exportedFuncs, jsStubs: toJavaScriptStubs(exportedFuncs, endpoints, keys),
    };
}
async function runWasmReconFromBuffer(buf, destPath, opts) {
    const { writeFile } = await Promise.resolve().then(() => __importStar(require('fs/promises')));
    try {
        await writeFile(destPath, buf);
        return runWasmRecon(destPath, { ...opts, projectRoot: path_1.default.dirname(destPath) });
    }
    catch (e) {
        return { ok: false, path: destPath, url: opts?.url, error: `Failed to write wasm: ${e.message}`, endpoints: [], keys: [], crypto: [], exportedFuncs: [], jsStubs: '' };
    }
}
