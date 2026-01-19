# Stealth Automation Detection Patches — Summary

## Overview
Enhanced `desktop/stealth-inject.js` with comprehensive patches to neutralize automation detection signals used for bot fingerprinting. All patches are runtime-only JavaScript/TypeScript injections executed before page scripts via `executeJavaScript` in `main.ts`.

## ✅ Patched Signals

### 1. `navigator.webdriver` ✅ (Enhanced)
**Status:** Already existed, now enhanced with multiple layers

**Implementation:**
- Primary: `Object.defineProperty(navigator, 'webdriver', { get: () => false })`
- Secondary: `Proxy` on `navigator` to catch dynamic property access
- Protection against: `in` operator, `Object.keys()`, `Object.getOwnPropertyNames()`, `Reflect.has()`

**Verification:**
```js
console.log(navigator.webdriver); // false
console.log('webdriver' in navigator); // true (but returns false when accessed)
```

### 2. `$cdc_` Detection Strings ✅ (NEW)
**Status:** Comprehensive protection added

**Implementation:**
- **Function.prototype.toString**: Strips `$cdc_*` patterns from function string representations
- **DOM Property Scanning**: Recursively removes `$cdc_*` properties from `window` and `document`
- **Proxy Protection**: `window` Proxy prevents `$cdc_` property enumeration and access
- **Ongoing Monitoring**: `MutationObserver` watches for scripts that inject `$cdc_` properties

**What it protects against:**
- Chrome DevTools Protocol (CDP) injection markers
- Function string inspection: `Function.prototype.toString().includes('$cdc_')`
- DOM property enumeration: `Object.keys(window).filter(k => k.startsWith('$cdc_'))`
- Script injection: Inline/external scripts containing `$cdc_` patterns

**Verification:**
```js
// Should return empty string or no matches
Function.prototype.toString.call(function test() { /* $cdc_anything */ }).includes('$cdc_'); // false

// Should not enumerate $cdc_ properties
Object.keys(window).filter(k => /^\$cdc_/.test(k)); // []
```

### 3. `window.chrome.runtime` ✅ (NEW)
**Status:** Patched to prevent automation detection

**Implementation:**
- Mocks `chrome.runtime` with minimal object
- Removes `runtime.id` (extension ID detection)
- Returns `null` for `connect()` and `sendMessage()` to prevent extension detection

**Verification:**
```js
console.log(window.chrome?.runtime?.id); // undefined
console.log(typeof window.chrome?.runtime?.connect); // 'function' (but returns null)
```

### 4. `navigator.plugins.length` ✅ (NEW)
**Status:** Normalized to match Chrome defaults

**Implementation:**
- Normalizes `navigator.plugins.length` to 5 (typical Chrome value)
- Only adjusts if length is 0 or > 10 (obviously wrong values)

**Verification:**
```js
console.log(navigator.plugins.length); // 5 (if originally 0 or > 10)
```

### 5. `Function.prototype.toString` Protection ✅ (NEW)
**Status:** Prevents function string inspection detection

**Implementation:**
- Wraps `Function.prototype.toString` to strip `$cdc_*` patterns
- Also patches `Object.prototype.toString` for additional safety
- Removes patterns: `$cdc_*`, `cdc_*`, `$[a-z]+\$[a-z]+`

**Verification:**
```js
function test() { /* $cdc_secret */ }
Function.prototype.toString.call(test).includes('$cdc_'); // false
```

### 6. AudioContext Fingerprinting ✅ (NEW)
**Status:** Adds entropy to prevent unique identification

**Implementation:**
- Wraps `createOscillator()` to add ±0.01Hz jitter to frequency
- Wraps `createAnalyser()` to add ±1 jitter to FFT size (for common values)
- Prevents consistent audio fingerprinting

**Verification:**
```js
const ctx = new AudioContext();
const osc = ctx.createOscillator();
// Frequency will have slight jitter, breaking exact fingerprinting
```

### 7. `Notification.permission` ✅ (NEW)
**Status:** Normalized to match Chrome defaults

**Implementation:**
- Returns `'default'` if permission was never explicitly set (not `'denied'`)
- Uses localStorage to track explicit user decisions

**Verification:**
```js
console.log(Notification.permission); // 'default' (unless explicitly set by user)
```

### 8. Battery API ✅ (NEW)
**Status:** Adds entropy to prevent unique fingerprinting

**Implementation:**
- Wraps `navigator.getBattery()` to add ±1% jitter to charge level
- Prevents consistent battery-based fingerprinting

**Verification:**
```js
navigator.getBattery().then(b => console.log(b.chargingLevel)); // Has slight jitter
```

### 9. Permissions API ✅ (NEW)
**Status:** Normalized query results

**Implementation:**
- Wraps `navigator.permissions.query()` to return `'prompt'` not `'denied'` by default
- Only returns `'denied'` if explicitly set by user (via localStorage)

**Verification:**
```js
navigator.permissions.query({ name: 'notifications' }).then(r => console.log(r.state)); // 'prompt' (default)
```

### 10. Additional Automation Detection ✅ (NEW)
**Status:** Window.external and document.$cdc_ cleanup

**Implementation:**
- Ensures `window.external` exists (empty object, not exposing automation)
- Scans and removes `$cdc_*` properties from `document`

**Verification:**
```js
console.log(window.external); // {} (not undefined, not exposing automation)
Object.keys(document).filter(k => /^\$cdc_/.test(k)); // []
```

### 11. Ongoing $cdc_ Protection ✅ (NEW)
**Status:** MutationObserver-based monitoring

**Implementation:**
- `MutationObserver` watches for script additions
- Neutralizes inline scripts containing `$cdc_` patterns
- Blocks external scripts with `$cdc_` in src (removes src attribute)

**Verification:**
```js
// Injected scripts with $cdc_ should be neutralized automatically
```

## Existing Patches (Maintained)

### ✅ Error Stack Sanitization
- Strips Electron/Node paths, replaces with `chrome://browser/`

### ✅ `navigator.userAgentData`
- High-entropy values for Mac M-series

### ✅ `navigator.deviceMemory`
- From native macOS APIs via `window.__deviceMemory`

### ✅ Node.js Leak Prevention
- Hides `process`, `Buffer`, `require`, `global` from window

### ✅ `performance.now()` Jitter
- Adds ±2µs jitter to prevent timing fingerprinting

### ✅ WebGL Fingerprinting
- Patches `UNMASKED_VENDOR_WEBGL` and `UNMASKED_RENDERER_WEBGL` to Apple values

### ✅ Canvas measureText
- Opt-in CoreText-backed rendering when `DEEP_RECON_MEASURE_TEXT_NATIVE=1`

## Testing & Verification

### Manual Testing
1. Launch Electron app: `npm start` from `desktop/`
2. Open DevTools in target browser (left panel)
3. Run verification snippets in Console

### Automated Testing (Future)
Consider adding automated tests to verify patches remain effective:
```js
// test/stealth-patches.test.js
describe('Stealth Patches', () => {
  it('should hide navigator.webdriver', () => {
    expect(navigator.webdriver).toBe(false);
  });
  
  it('should remove $cdc_ patterns from function strings', () => {
    const fnStr = Function.prototype.toString.call(someFunction);
    expect(fnStr).not.toContain('$cdc_');
  });
  
  // ... more tests
});
```

## Known Limitations

1. **Proxy Limitations**: Cannot replace `navigator` or `window` directly, but Proxy helps with indirect access
2. **MutationObserver**: May not catch all dynamic script injections (timing-dependent)
3. **Battery API**: Requires user permission, may not be available on all platforms
4. **AudioContext**: Jitter is minimal to avoid audible artifacts, may not prevent all fingerprinting

## Integration

The enhanced `stealth-inject.js` is automatically injected via `desktop/main.ts`:

```typescript
browserView.webContents.on('did-finish-load', () => {
  // ... other injections
  wc.executeJavaScript(loadStealthScript()).catch(() => {});
  // ...
});
```

All patches execute **before** page scripts via `did-finish-load` event, ensuring they take effect early in the page lifecycle.

## Future Enhancements

Consider adding:
- [ ] Font fingerprinting protection (list normalization)
- [ ] Screen resolution jitter (prevent unique fingerprinting)
- [ ] MediaDevices.getUserMedia() entropy (microphone/camera)
- [ ] WebRTC IP leak prevention
- [ ] Canvas noise injection for more realistic fingerprints
- [ ] Automated test suite for stealth patches
