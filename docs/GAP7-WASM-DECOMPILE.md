# Gap 7: Wasm Capture & Decompilation

## Issue

High-security sites put auth or token logic in **WebAssembly** so it’s harder to inspect from JS. A recon tool needs to capture `.wasm` and optionally decompile it.

## What’s Implemented

### Capture (stream_ws.py)

- In the `response` hook, when `Content-Type` contains `wasm`, the response body is written to:
  - `wasm-captures/<ts>_<sha256-prefix>.wasm`
- The HTTP flow event gets `wasmPath: "wasm-captures/..."` so the Explorer (or other tools) can show it and trigger decompilation.

### Decompile script

- **`scripts/decompile-wasm.js`**  
  - Takes a path to a `.wasm` file.  
  - Tries `wasm2c` (C-like) or `wasm-decompile` (WAT-like) from [wabt](https://github.com/WebAssembly/wabt).  
  - Writes `.c` or `.wat` next to the `.wasm`.

- Install wabt: `brew install wabt`  
- Run:  
  `node scripts/decompile-wasm.js wasm-captures/1737123456789_abc12345.wasm`

## Possible UI Integration

- In the Explorer, when a flow has `wasmPath`, show a “Decompile” action that:
  - Runs `scripts/decompile-wasm.js` on that path, and  
  - Opens or displays the generated `.c` / `.wat` in a panel or new window.

## References

- [wabt](https://github.com/WebAssembly/wabt): wasm2c, wasm-decompile, wasm2wat.
