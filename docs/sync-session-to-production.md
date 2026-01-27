# Sync Auth Worker Session to Production

Before you can refresh tokens or use DNC scrubbing on the production server, you need to sync your local auth worker session to production.

## Quick Sync (Recommended)

```bash
npx tsx scripts/sync-auth-worker-to-production.ts har_1769284596726_agent_ushadvisors_com
```

This will:
1. Read your local session file
2. Validate the session data
3. POST it to `https://brainscraper.io/api/auth-worker/sync`
4. Confirm success

## Manual Sync via cURL

```bash
curl -X POST https://brainscraper.io/api/auth-worker/sync \
  -H "Content-Type: application/json" \
  -d @data/auth-workers/har_1769284596726_agent_ushadvisors_com.json
```

## Sync All Sessions

To sync all your auth workers at once:

```bash
npx tsx scripts/sync-all-auth-workers.ts
```

## Verify Sync

After syncing, verify the session is available:

```bash
curl -X POST https://brainscraper.io/api/auth-worker/refresh \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "har_1769284596726_agent_ushadvisors_com"}'
```

If you get `{"success": true, ...}` instead of `{"error":"Session not found"}`, the sync was successful.

## Why Sync is Needed

- Sessions are stored locally in `data/auth-workers/`
- Production server has its own storage
- Sessions must be synced before they can be used on production
- Sync only needs to be done once (or when session is updated)

## When to Sync

- ✅ After creating a new auth worker from HAR file
- ✅ After updating session tokens locally
- ✅ Before using production API endpoints
- ✅ When you get "Session not found" errors
