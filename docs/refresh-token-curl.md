# Refresh JWT Token - Exact cURL Commands

## ⚠️ IMPORTANT: Sync Session First

**Before refreshing, you must sync your session to production:**

```bash
# Option 1: Use the sync script (recommended)
npx tsx scripts/sync-auth-worker-to-production.ts har_1769284596726_agent_ushadvisors_com

# Option 2: Sync via curl (read session file and POST it)
curl -X POST https://brainscraper.io/api/auth-worker/sync \
  -H "Content-Type: application/json" \
  -d @data/auth-workers/har_1769284596726_agent_ushadvisors_com.json
```

**After syncing, you can refresh the token.**

## Method 1: Refresh Token Directly (Recommended)

```bash
curl -X POST https://brainscraper.io/api/auth-worker/refresh \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "har_1769284596726_agent_ushadvisors_com"}'
```

**For local development:**
```bash
curl -X POST http://localhost:3000/api/auth-worker/refresh \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "har_1769284596726_agent_ushadvisors_com"}'
```

## Method 2: Get Token (Auto-Refreshes if Needed)

This endpoint automatically refreshes the token if it's about to expire:

**Note:** This endpoint requires an API key. Your current session doesn't have an API key, so use Method 1 (refresh endpoint) instead, which doesn't require an API key.

If you need to use this endpoint, first check if your session has an API key:
```bash
cat data/auth-workers/har_*_agent_ushadvisors_com.json | jq '.apiKey'
```

If it returns `null`, use Method 1 instead. If it returns a value, use that value in the request below:

```bash
curl -X GET "https://brainscraper.io/api/auth-worker/token?sessionId=har_1769284596726_agent_ushadvisors_com&apiKey=<your-api-key>" \
  -H "Content-Type: application/json"
```

## Method 3: Get Session ID First, Then Refresh

If you don't know your sessionId, get it first:

```bash
# List all sessions (if you have a sessions endpoint)
# Or check your session file:
cat data/auth-workers/har_*_agent_ushadvisors_com.json | jq '.sessionId'
```

Then use the sessionId in the refresh command above.

## Response Format

### Successful Refresh Response:
```json
{
  "success": true,
  "sessionId": "har_1769284596726_agent_ushadvisors_com",
  "newAccessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 85555,
  "expiresAt": 1769370434000
}
```

### Error Response:
```json
{
  "error": "Session not found"
}
```

or

```json
{
  "error": "No refresh token available for this session"
}
```

## Quick Reference

### Your Current Session:
- **Session ID**: `har_1769284596726_agent_ushadvisors_com`
- **Domain**: `agent.ushadvisors.com`
- **Refresh URL**: `https://api-identity-agent.ushadvisors.com/account/refresh`

### One-Liner (Copy & Paste):
```bash
curl -X POST https://brainscraper.io/api/auth-worker/refresh -H "Content-Type: application/json" -d '{"sessionId": "har_1769284596726_agent_ushadvisors_com"}'
```

### With Pretty Print (jq):
```bash
curl -X POST https://brainscraper.io/api/auth-worker/refresh \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "har_1769284596726_agent_ushadvisors_com"}' | jq
```

## Notes

- The refresh endpoint uses Bearer token refresh (not OAuth refresh_token)
- It automatically uses the stored `refresh_url` from your session
- The token refresh happens server-side and updates the session automatically
- You don't need to provide the current token - it's retrieved from the session
- The refresh endpoint handles both OAuth and Bearer token refresh flows automatically

## Troubleshooting

### If you get "Session not found":
1. **Sync the session to production first** (see "IMPORTANT: Sync Session First" above)
2. Check that the sessionId is correct
3. Verify the session file exists in `data/auth-workers/`
4. Run the sync script: `npx tsx scripts/sync-auth-worker-to-production.ts har_1769284596726_agent_ushadvisors_com`

### If you get "No refresh token available":
1. Check that your session has a `refresh_url` in `step2.extractedVars`
2. Verify the refresh endpoint is accessible
3. The session might need to be recreated from a HAR file

### If refresh fails with "401 Unauthorized":
**This means your token is expired and the refresh endpoint doesn't accept expired tokens.**

**Solution:** You need to re-authenticate to get a fresh token:
1. Log into agent.ushadvisors.com in your browser
2. Capture a new HAR file with the authentication flow
3. Create a new auth worker: `npx tsx scripts/process-har-file.ts path/to/new-har-file.har`
4. Sync to production: `npx tsx scripts/sync-auth-worker-to-production.ts <new-session-id>`

**See `docs/token-expired-solution.md` for detailed instructions.**

### If refresh fails for other reasons:
1. Check server logs for detailed error messages
2. Verify the refresh URL is correct and accessible
3. Ensure the token hasn't been expired for too long (some endpoints don't accept expired tokens for refresh)
