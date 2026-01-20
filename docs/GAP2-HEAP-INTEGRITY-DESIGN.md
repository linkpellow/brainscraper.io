# Gap 2: Snapshot-Aware Integrity Check — Design

## Issue

Anti-bot tooling can detect **V8 heap snapshots** and **tampered JS primitives** (e.g. `Array.prototype.push` replaced with a logging wrapper). Standard ASAR/code-signing does not cover heap layout or runtime hooks.

## Lightweight (Current)

- **`desktop/integrity-inject.js`**: On each load, hashes `Array.prototype.push`, `Object.keys`, `Function.prototype.apply`, `document.createElement` (as strings). Sends `INTEGRITY_HASH` to main.
- **Main**: Can log it, or compare to a baseline file. If the hash changes and a baseline exists, log a warning. No baseline in v1.

## Full Fix: C++ Snapshot-Aware Module

A **native Node addon** (C++) that:

1. **On startup** (or on demand):  
   - Call into V8 to compute a **hash of critical heap regions** (e.g. `Array.prototype` slot, `Function.prototype` slot, a small set of well-known builtins).  
   - Optionally, use `v8::HeapSnapshot` and hash the serialized snapshot (or a fingerprint of it).  
   - Store the result in a file or in memory as the “baseline”.

2. **On a schedule or before sensitive actions**:  
   - Recompute the same hash.  
   - If it differs from the baseline → **possible tampering** (stealth hooks or heap modification).  
   - Action: log, set a flag, or (if policy) block further automation.

### Requirements

- **Node / Electron**: `node-gyp`, `@electron/rebuild` or similar to build the addon against the Electron V8/ABI.
- **V8 API**: Use `v8::Isolate`, `v8::Local`, and V8’s embedding API to read heap/object layout. This is off the Node.js public API; you need to link against the same V8/Node/Electron build.
- **Maintainability**: V8/Node/Electron ABI changes frequently; the addon must be rebuilt for each Electron upgrade.

### Sketch (pseudocode)

```cpp
// native-integrity addon
#include <v8.h>
#include <node.h>

// Compute a fingerprint of Array.prototype.push and a few other builtins.
// This is a placeholder; real impl would use V8's internal APIs or
// heap snapshot primitives.
void GetHeapFingerprint(const v8::FunctionCallbackInfo<v8::Value> &args) {
  v8::Isolate *isolate = args.GetIsolate();
  // ... get Array.prototype.push, read its representation, hash ...
  // args.GetReturnValue().Set(...);
}

void Init(v8::Local<v8::Object> exports) {
  NODE_SET_METHOD(exports, "getHeapFingerprint", GetHeapFingerprint);
}
NODE_MODULE(NODE_GYP_MODULE_NAME, Init);
```

### References

- [V8 Embedder’s Guide](https://v8.dev/docs/embed)
- [Node.js Native Addons](https://nodejs.org/api/addons.html)
- [Electron / Rebuild](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules)
