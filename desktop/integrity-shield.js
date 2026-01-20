"use strict";
/**
 * Zero-Day Integrity & Protocol Shield (desktop, inlined)
 * V8 baseline, ASAR (when env set), macOS rendering. Call configureMacOSRendering before app.ready.
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
exports.checkV8Integrity = checkV8Integrity;
exports.checkAsarIntegrity = checkAsarIntegrity;
exports.configureMacOSRendering = configureMacOSRendering;
exports.runIntegrityChecks = runIntegrityChecks;
const electron_1 = require("electron");
const promises_1 = require("fs/promises");
const path_1 = __importDefault(require("path"));
const BASELINE_FILENAME = '.v8-integrity-baseline';
const PROJECT_ROOT = path_1.default.resolve(__dirname, '..');
function getBaselinePath() {
    try {
        return path_1.default.join(electron_1.app.getPath('userData'), BASELINE_FILENAME);
    }
    catch {
        return path_1.default.join(PROJECT_ROOT, BASELINE_FILENAME);
    }
}
async function checkV8Integrity(currentHash) {
    const bp = getBaselinePath();
    try {
        const existing = await (0, promises_1.readFile)(bp, 'utf-8').then((s) => s.trim()).catch(() => null);
        if (currentHash == null || currentHash === '')
            return { v8Ok: true };
        if (existing == null || existing === '') {
            await (0, promises_1.writeFile)(bp, currentHash, 'utf-8');
            return { v8Ok: true };
        }
        if (existing !== currentHash)
            return { v8Ok: false, error: `V8 integrity mismatch` };
        return { v8Ok: true };
    }
    catch (e) {
        return { v8Ok: true, error: e.message };
    }
}
async function checkAsarIntegrity() {
    const baseline = process.env.DEEP_RECON_ASAR_BASELINE;
    if (!baseline || !electron_1.app.isPackaged)
        return { asarOk: true };
    const asarPath = path_1.default.join(process.resourcesPath, 'app.asar');
    try {
        await (0, promises_1.access)(asarPath);
    }
    catch {
        return { asarOk: true };
    }
    const { createHash } = await Promise.resolve().then(() => __importStar(require('crypto')));
    const h = createHash('sha256').update(await (0, promises_1.readFile)(asarPath)).digest('hex');
    if (h !== baseline.trim())
        return { asarOk: false, error: 'ASAR integrity mismatch' };
    return { asarOk: true };
}
function configureMacOSRendering() {
    if (process.platform !== 'darwin')
        return;
    electron_1.app.commandLine.appendSwitch('--enable-font-antialiasing');
    electron_1.app.commandLine.appendSwitch('--enable-font-subpixel-positioning');
    electron_1.app.commandLine.appendSwitch('--force-color-profile', 'srgb');
}
async function runIntegrityChecks(v8Hash) {
    const haltOnFail = process.env.DEEP_RECON_HALT_ON_FAIL === '1' || process.env.DEEP_RECON_HALT_ON_FAIL === 'true';
    const v8 = await checkV8Integrity(v8Hash);
    const asar = await checkAsarIntegrity();
    const v8Ok = v8.v8Ok, asarOk = asar.asarOk, halted = haltOnFail && (!v8Ok || !asarOk);
    return { v8Ok, v8Error: v8.error, asarOk, asarError: asar.error, halted };
}
