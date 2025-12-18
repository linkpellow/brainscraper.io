# Comprehensive Credential Harvesting Guide

Step-by-step instructions for harvesting **ALL** secrets, tokens, and credentials from tampausha console and network traffic, including:
- ✅ OAuth tokens (access_token, refresh_token, id_token)
- ✅ Client credentials (client_id, client_secret)
- ✅ Service account credentials
- ✅ JWT tokens
- ✅ API keys
- ✅ Session IDs
- ✅ CSRF tokens
- ✅ Hidden form fields
- ✅ IndexedDB storage
- ✅ WebSocket connections
- ✅ And much more...

## Method 1: Browser Console - COMPREHENSIVE (Recommended)

### Step 1: Open Browser Console
1. Navigate to `https://agent.ushadvisors.com` (or your tampausha console)
2. Open Developer Tools:
   - **Chrome/Edge**: Press `F12` or `Cmd+Option+I` (Mac) / `Ctrl+Shift+I` (Windows)
   - **Firefox**: Press `F12` or `Cmd+Option+K` (Mac) / `Ctrl+Shift+K` (Windows)
3. Click on the **Console** tab

### Step 2: Run Comprehensive Harvest Script
1. Open the file: `scripts/harvest-credentials-comprehensive.js`
2. **Copy the entire contents** of the file
3. **Paste into the browser console**
4. Press `Enter`

### Step 3: Review Results
- Results will be displayed in the console with categorized sections
- Full JSON output is automatically copied to your clipboard
- Access full results via: `window.__harvestedCredentialsComprehensive`

### What It Captures (COMPREHENSIVE):
- ✅ **OAuth tokens**: access_token, refresh_token, id_token
- ✅ **Client credentials**: client_id, client_secret, app_id, app_secret
- ✅ **Service account credentials**: service_key, private_key, account_key
- ✅ **JWT tokens**: All JWT format tokens (3-part structure)
- ✅ **API keys**: RapidAPI, X-API-Key, and all API key patterns
- ✅ **Session data**: session_id, session_token, sessid
- ✅ **CSRF tokens**: csrf_token, xsrf_token, authenticity_token
- ✅ **localStorage**: ALL items (not just matching patterns)
- ✅ **sessionStorage**: ALL items
- ✅ **Cookies**: All cookies including HttpOnly (via document.cookie)
- ✅ **IndexedDB**: Deep extraction from IndexedDB databases
- ✅ **Window objects**: Deep traversal of all window properties
- ✅ **Hidden form fields**: All hidden input fields
- ✅ **Meta tags**: All meta tags with credential-like content
- ✅ **URL parameters**: OAuth callbacks, state, code parameters
- ✅ **Hash fragments**: OAuth implicit flow tokens
- ✅ **Network requests**: All fetch/XHR headers and bodies
- ✅ **WebSocket connections**: All WebSocket URLs
- ✅ **Service Workers**: Service worker registrations
- ✅ **Deep object traversal**: Nested credentials in objects
- ✅ **Base64 encoded**: Detects base64-like credentials
- ✅ **Auth libraries**: Axios, Auth0, Okta, Firebase, AWS, Google, Microsoft

### Alternative: Basic Browser Script
If you only need basic extraction, use `scripts/harvest-credentials-browser.js` instead.

---

## Method 2: HAR File Analysis (For Network Traffic)

### Step 1: Capture Network Traffic
1. Open Developer Tools (`F12`)
2. Go to **Network** tab
3. Perform actions on tampausha console (login, API calls, etc.)
4. Right-click in Network tab → **Save all as HAR with content**
5. Save the file (e.g., `tampausha-network.har`)

### Step 2: Run HAR Parser
```bash
# Using default HAR file
npx tsx scripts/harvest-credentials-har.ts

# Or specify custom HAR file
npx tsx scripts/harvest-credentials-har.ts path/to/your/file.har
```

### Step 3: Review Results
- Results displayed in terminal
- Full results saved to: `harvested-credentials.json`
- Tokens only saved to: `harvested-tokens.json`

### What It Captures:
- ✅ Authorization headers (Bearer tokens)
- ✅ API keys in headers (X-RapidAPI-Key, X-API-Key, etc.)
- ✅ Tokens in request bodies
- ✅ Tokens in response bodies
- ✅ Cookies with auth data
- ✅ Query parameter tokens
- ✅ JWT token decoding

---

## Method 3: Complete System Audit

### Run Complete Harvest
```bash
npx tsx scripts/harvest-credentials-complete.ts [optional-har-file-path]
```

### What It Captures:
- ✅ All HAR file credentials
- ✅ Environment variables (RAPIDAPI_KEY, USHA_JWT_TOKEN, etc.)
- ✅ Hardcoded secrets in code files
- ✅ Configuration files (.env, railway.toml, etc.)

### Results:
- Complete audit saved to: `harvested-credentials-complete.json`
- Includes all sources and locations

---

## Quick Reference

### Browser Console Script
```javascript
// Quick one-liner to extract tokens from localStorage
Object.keys(localStorage).forEach(key => {
  if (key.toLowerCase().includes('token') || key.toLowerCase().includes('auth')) {
    console.log(key, localStorage.getItem(key));
  }
});
```

### Extract Specific Token
```javascript
// In browser console on tampausha
localStorage.getItem('your-token-key')
// or
sessionStorage.getItem('your-token-key')
// or
document.cookie
```

### Monitor Network Requests
```javascript
// Paste in browser console to intercept all fetch requests
const originalFetch = window.fetch;
window.fetch = function(...args) {
  console.log('Fetch:', args[0], args[1]?.headers);
  return originalFetch.apply(this, args);
};
```

---

## Output Files

All scripts generate JSON files with the following structure:

```json
{
  "timestamp": "2025-12-18T...",
  "tokens": [
    {
      "source": "localStorage",
      "type": "bearer_token",
      "key": "authToken",
      "value": "eyJhbGc...",
      "url": "https://..."
    }
  ],
  "summary": {
    "totalTokens": 5,
    "uniqueTokens": 3
  }
}
```

---

## Security Notes

⚠️ **Important**: 
- These scripts are for **audit purposes only**
- Never commit harvested credentials to version control
- Store results securely
- Rotate any exposed credentials immediately
- The `.gitignore` should exclude `harvested-*.json` files

---

## Troubleshooting

### Browser Console Script Not Working
- Ensure you're on the correct domain (ushadvisors.com)
- Check if JavaScript is enabled
- Try in an incognito/private window
- Check browser console for errors

### HAR File Not Found
- Verify the file path is correct
- Check file permissions
- Ensure HAR file is valid JSON

### No Credentials Found
- Credentials may be in HTTP-only cookies (not accessible via JavaScript)
- Tokens may be in request bodies only (capture during active session)
- Some credentials may require authentication to access

---

## Comprehensive Coverage

The **comprehensive script** (`harvest-credentials-comprehensive.js`) captures:

### ✅ OAuth & Authentication
- Access tokens (OAuth 2.0)
- Refresh tokens
- ID tokens (OpenID Connect)
- Authorization codes
- State parameters
- PKCE codes (code_verifier, code_challenge)
- OAuth callback URLs

### ✅ Client Credentials
- client_id
- client_secret
- app_id / app_secret
- API keys (all formats)
- Service account keys

### ✅ Service Accounts
- Private keys
- Public keys
- Account keys
- Service keys

### ✅ All Token Types
- JWT tokens (3-part structure detection)
- Bearer tokens
- Session tokens
- CSRF tokens
- API tokens

### ✅ Storage Locations
- localStorage (ALL items)
- sessionStorage (ALL items)
- Cookies (including HttpOnly detection attempts)
- IndexedDB (deep extraction)
- Window objects (deep traversal)
- Hidden form fields
- Meta tags

### ✅ Network Traffic
- HTTP headers (all credential patterns)
- Request bodies (JSON and text parsing)
- Response bodies (deep JSON traversal)
- Query parameters
- URL hash fragments
- WebSocket connections

### ✅ Advanced Detection
- Base64 encoded credentials
- Nested object traversal (up to 10 levels deep)
- Pattern matching (50+ credential patterns)
- JWT structure detection
- Auth library integration (Axios, Auth0, Okta, etc.)

---

## Next Steps

After harvesting credentials:

1. **Review** all extracted tokens and keys
2. **Verify** which credentials are active
3. **Document** credential usage in your workflow
4. **Rotate** any exposed or compromised credentials
5. **Update** environment variables and configuration files

---

## Important Notes

⚠️ **The comprehensive script captures ALL credentials, including:**
- Hidden secrets in nested objects
- OAuth tokens in URL fragments
- Client credentials in request bodies
- Service account keys in IndexedDB
- CSRF tokens in form fields
- Session IDs in cookies
- And much more...

🔒 **Security**: Never commit harvested credentials to version control. The `.gitignore` excludes `harvested-*.json` files.
