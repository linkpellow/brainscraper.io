# Token Expired - Solution

## Problem

Your token expired and the refresh endpoint doesn't accept expired tokens. You need to re-authenticate.

## Solution: Re-authenticate to Get Fresh Token

### Option 1: Create New Auth Worker from Fresh HAR File (Recommended)

1. **Log into agent.ushadvisors.com in your browser**
2. **Capture a new HAR file** with the authentication flow
3. **Create a new auth worker:**
   ```bash
   npx tsx scripts/process-har-file.ts path/to/your/new-har-file.har
   ```
4. **Sync to production:**
   ```bash
   npx tsx scripts/sync-auth-worker-to-production.ts <new-session-id>
   ```

### Option 2: Update Existing Session with Fresh Token

If you have a fresh token from logging in manually:

1. **Get your fresh JWT token** - Use the console snippets in `docs/extract-token-from-browser.md`:
   - Open browser console on `agent.ushadvisors.com`
   - Run the "Complete Extraction Script" from that file
   - Copy the token and expiration timestamp

2. **Update the session file:**
   ```bash
   # Replace YOUR_TOKEN and YOUR_EXPIRES_AT with values from console
   TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."  # From console
   EXPIRES_AT="1769370434000"  # From console (milliseconds)
   
   # Update session file
   cat data/auth-workers/har_1769284596726_agent_ushadvisors_com.json | \
     jq ".step2.extractedVars.access_token = \"$TOKEN\" | .step2.extractedVars.expires_at = \"$EXPIRES_AT\"" > temp.json && \
     mv temp.json data/auth-workers/har_1769284596726_agent_ushadvisors_com.json
   ```

3. **Sync to production:**
   ```bash
   npx tsx scripts/sync-auth-worker-to-production.ts har_1769284596726_agent_ushadvisors_com
   ```

### Option 3: Use Manual Authentication Script

If you have credentials, you can use the direct auth script:

```bash
# Check if you have a direct auth script
ls scripts/*auth*.ts
```

## Why This Happened

- Token expired: `2026-01-25T19:47:14.000Z`
- Current time: `2026-01-26T01:32:29.000Z`
- Expired: **345 minutes ago** (~5.75 hours)

The refresh system should have refreshed it 30 minutes before expiration, but:
- The token was already expired when you tried to refresh
- USHA's refresh endpoint doesn't accept expired tokens
- You need a fresh token to continue

## Prevention

The refresh system will work correctly going forward:
- ✅ Refreshes tokens 30 minutes before expiration
- ✅ Background job checks every 5 minutes
- ✅ Automatic refresh on API calls via `getValidToken()`

But you need to get a fresh token first by re-authenticating.
