#!/usr/bin/env node
/**
 * Gap 7: Wasm decompilation.
 * Decompiles a .wasm file to C (wasm2c) or WAT (wasm-decompile) if the tool
 * is in PATH. Run from project root:
 *   node scripts/decompile-wasm.js wasm-captures/1737123456789_abc12345.wasm
 *
 * Requires: wasm2c (from wabt) or wasm-decompile (from wabt) in PATH.
 *   - macOS: brew install wabt
 */

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const wasmPath = process.argv[2];
if (!wasmPath || !fs.existsSync(wasmPath)) {
  console.error('Usage: node scripts/decompile-wasm.js <path-to-.wasm>');
  process.exit(1);
}
const base = path.basename(wasmPath, '.wasm');
const outDir = path.dirname(wasmPath);

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf-8', ...opts });
  return r.status === 0 ? r.stdout : null;
}

// Prefer wasm2c (C-like); fallback wasm-decompile (WAT-like)
const cOut = path.join(outDir, base + '.c');
const watOut = path.join(outDir, base + '.wat');
if (run('wasm2c', ['-o', cOut, wasmPath])) {
  console.log('wasm2c ->', cOut);
} else if (run('wasm-decompile', ['-o', watOut, wasmPath])) {
  console.log('wasm-decompile ->', watOut);
} else {
  console.error('Neither wasm2c nor wasm-decompile found. Install wabt: brew install wabt');
  process.exit(1);
}
