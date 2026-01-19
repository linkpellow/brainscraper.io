# Testing Stealth Patches — Instructions

## ✅ How to Test the Patches

The JavaScript verification code **must be run in the Electron app's DevTools console**, not in your terminal.

### Step 1: Launch the Electron App

```bash
# From project root
cd desktop
npm start

# OR from project root directly
npm run desktop
```

### Step 2: Open DevTools in the Target Browser

1. The Electron app will open with **two panels**:
   - **Left panel**: Target browser (where you navigate websites)
   - **Right panel**: Next.js Explorer UI

2. **In the LEFT panel (target browser)**, press:
   - `Cmd+Option+I` (macOS) or `Ctrl+Shift+I` (Windows/Linux)
   - OR: Right-click → "Inspect Element"

3. This opens DevTools for the **target browser** (where stealth patches are injected)

### Step 3: Run Verification Code in Console

In the **Console** tab of DevTools, paste and run:

```javascript
// Test 1: navigator.webdriver should be false
console.log('navigator.webdriver:', navigator.webdriver);
// Expected: false (not true)

// Test 2: No $cdc_ properties in window
const cdcProps = Object.keys(window).filter(k => /^\$cdc_/.test(k));
console.log('$cdc_ properties in window:', cdcProps);
// Expected: [] (empty array)

// Test 3: Function.prototype.toString should not contain $cdc_
const fnStr = Function.prototype.toString.call(() => {});
console.log('Function toString contains $cdc_:', fnStr.includes('$cdc_'));
// Expected: false

// Test 4: Test Function.prototype.toString on a real function
function testFunction() { /* some code */ }
const testStr = Function.prototype.toString.call(testFunction);
console.log('Test function toString contains $cdc_:', testStr.includes('$cdc_'));
// Expected: false

// Test 5: chrome.runtime should not expose automation
console.log('chrome.runtime.id:', window.chrome?.runtime?.id);
// Expected: undefined

// Test 6: navigator.plugins.length should be normalized
console.log('navigator.plugins.length:', navigator.plugins.length);
// Expected: 5 (or a reasonable number, not 0)

// Test 7: Notification.permission should be default
console.log('Notification.permission:', Notification.permission);
// Expected: 'default' (unless explicitly set by user)
```

## 🔍 Quick Verification Script

Copy this entire block into the Console:

```javascript
(function() {
  const results = {
    'navigator.webdriver': navigator.webdriver === false ? '✅ PASS' : '❌ FAIL',
    '$cdc_ in window': Object.keys(window).filter(k => /^\$cdc_/.test(k)).length === 0 ? '✅ PASS' : '❌ FAIL',
    'Function.toString clean': !Function.prototype.toString.call(() => {}).includes('$cdc_') ? '✅ PASS' : '❌ FAIL',
    'chrome.runtime.id': window.chrome?.runtime?.id === undefined ? '✅ PASS' : '❌ FAIL',
    'plugins.length normalized': navigator.plugins.length > 0 && navigator.plugins.length < 20 ? '✅ PASS' : '❌ FAIL',
    'Notification.permission': Notification.permission === 'default' || Notification.permission === 'granted' ? '✅ PASS' : '❌ FAIL'
  };
  
  console.log('=== STEALTH PATCHES VERIFICATION ===');
  Object.entries(results).forEach(([test, result]) => {
    console.log(`${test}: ${result}`);
  });
  console.log('====================================');
  
  const allPassed = Object.values(results).every(r => r === '✅ PASS');
  return allPassed ? '✅ All tests passed!' : '❌ Some tests failed';
})();
```

## 🧪 Alternative: Programmatic Testing

If you want to test programmatically, you can add a test endpoint in `main.ts`:

```typescript
// In desktop/main.ts, add this IPC handler:
ipcMain.handle('test-stealth-patches', async () => {
  if (!browserView?.webContents) return { error: 'No browser view' };
  
  return await browserView.webContents.executeJavaScript(`
    ({
      webdriver: navigator.webdriver === false,
      cdcInWindow: Object.keys(window).filter(k => /^\\$cdc_/.test(k)).length === 0,
      functionToStringClean: !Function.prototype.toString.call(() => {}).includes('$cdc_'),
      chromeRuntimeId: window.chrome?.runtime?.id === undefined,
      pluginsNormalized: navigator.plugins.length > 0 && navigator.plugins.length < 20,
      notificationPermission: ['default', 'granted'].includes(Notification.permission)
    })
  `);
});
```

Then call it from the Explorer UI or a test script.

## 📝 Expected Results

All tests should show **✅ PASS**:

- `navigator.webdriver` = `false` ✅
- No `$cdc_` properties in `window` ✅
- `Function.prototype.toString` doesn't contain `$cdc_` patterns ✅
- `chrome.runtime.id` = `undefined` ✅
- `navigator.plugins.length` = reasonable number (5-10) ✅
- `Notification.permission` = `'default'` or `'granted'` ✅

## ⚠️ Common Issues

### Issue: "navigator is not defined"
**Solution**: Make sure you're running the code in the **target browser's DevTools** (left panel), not the terminal or Node.js.

### Issue: "DevTools won't open"
**Solution**: The target browser might be using `contextIsolation: true`. Make sure you're opening DevTools on the actual web page, not the Electron shell.

### Issue: "Patches don't seem to work"
**Solution**: 
1. Check that `stealth-inject.js` is being loaded (check `main.ts` line 182)
2. Verify the script is executed before page scripts (should be in `did-finish-load`)
3. Check Console for any JavaScript errors

### Issue: Still seeing `navigator.webdriver = true`
**Solution**: 
1. Make sure `stealth-inject.js` loads **before** page scripts
2. Some pages may check `webdriver` before our patches load
3. Check that `--disable-blink-features=AutomationControlled` flag is set in `main.ts` (line 43)

## 🎯 Testing on Real Sites

To test if patches work against real detection:

1. Navigate to a site that detects automation (e.g., Cloudflare challenge pages)
2. Check if you get blocked or see "Automation detected" messages
3. Compare behavior before/after patches

**Note**: Real-world testing requires the patches + proper TLS/HTTP/2 alignment + realistic user behavior simulation.
