# Quick Start - Credential Harvesting

## ⚠️ IMPORTANT: How to Use the Script

### ❌ DON'T DO THIS:
```
// Don't type this in console:
scripts/harvest-credentials-comprehensive.js
```

### ✅ DO THIS INSTEAD:

1. **Open the file** in your editor:
   - File: `scripts/harvest-credentials-comprehensive.js`
   - Select ALL the code (Cmd+A / Ctrl+A)
   - Copy it (Cmd+C / Ctrl+C)

2. **Open browser console**:
   - Press `F12` on tampausha/ushadvisors.com
   - Click "Console" tab

3. **Paste the ENTIRE script**:
   - Paste (Cmd+V / Ctrl+V)
   - Press `Enter`

4. **Wait for results**:
   - Script will run automatically
   - Results displayed in console
   - JSON copied to clipboard

---

## Alternative: One-Liner Test

If you just want to quickly check localStorage for tokens:

```javascript
// Paste this in console:
Object.keys(localStorage).forEach(k => { if(k.toLowerCase().includes('token') || k.toLowerCase().includes('auth')) console.log(k, localStorage.getItem(k)); });
```

---

## Still Having Issues?

1. Make sure you're on the correct domain (ushadvisors.com)
2. Make sure Developer Tools Console is open
3. Make sure you copied the ENTIRE file contents (not just the filename)
4. Try refreshing the page and running again
