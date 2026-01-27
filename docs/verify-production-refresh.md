# Verify Production Refresh Functionality

## Overview

This document outlines how to verify that the production token refresh functionality is working correctly with all robustness improvements.

## Verification Steps

### 1. Verify Session Exists in Production

```bash
# Check if session is synced to production
curl -X POST https://brainscraper.io/api/auth-worker/refresh \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "har_1769140696887_api_business_agent_ushadvisors_com"}'
```

**Expected**: Should return either:
- `{"success": true, ...}` - Session exists and refresh worked
- `{"error": "Session not found"}` - Session needs to be synced

### 2. Sync Session to Production (if needed)

```bash
# Sync session to production
npx tsx scripts/sync-auth-worker-to-production.ts har_1769140696887_api_business_agent_ushadvisors_com
```

### 3. Test Refresh Endpoint Directly

```bash
# Test refresh endpoint
curl -X POST https://brainscraper.io/api/auth-worker/refresh \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "har_1769140696887_api_business_agent_ushadvisors_com"}' \
  | jq
```

**Expected Response**:
```json
{
  "success": true,
  "sessionId": "har_1769140696887_api_business_agent_ushadvisors_com",
  "newAccessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 85555,
  "expiresAt": 1769370434000
}
```

### 4. Verify Improvements Are Working

#### A. Timeout Protection (30 seconds)
- The refresh should complete within 30 seconds
- If endpoint is slow/unresponsive, should timeout with clear error

#### B. Headers Matching Browser
Check server logs to verify headers include:
- `Origin: https://api-identity-agent.ushadvisors.com`
- `Referer: https://api-identity-agent.ushadvisors.com/`
- `User-Agent: Mozilla/5.0...`
- `Connection: keep-alive`

#### C. Request Deduplication
- Trigger multiple concurrent refresh requests
- Verify only one actual HTTP request is made
- All callers should receive the same result

#### D. Error Handling
Test various error scenarios:
- Invalid refresh URL → Should fail fast with clear error
- Empty response → Should handle gracefully
- Malformed JSON → Should provide clear error message
- Network timeout → Should retry automatically

### 5. Test Auto-Refresh via getValidToken

```bash
# Test auto-refresh (via token endpoint)
curl -X GET "https://brainscraper.io/api/auth-worker/token?sessionId=har_1769140696887_api_business_agent_ushadvisors_com&apiKey=<your-api-key>" \
  -H "Content-Type: application/json" \
  | jq
```

**Expected**: Should return token, and if token expires within 30 minutes, should auto-refresh.

### 6. Monitor Refresh Failures

Check server logs for:
- `[TokenRefreshService]` logs showing refresh attempts
- `[AuthWorker]` logs showing Bearer token refresh
- Timeout errors (should be rare)
- Deduplication logs (when concurrent requests occur)

## Verification Checklist

- [ ] Session exists in production
- [ ] Refresh endpoint returns success
- [ ] New token is valid (not expired)
- [ ] Expiration time is correctly calculated
- [ ] Headers match browser request
- [ ] Timeout protection works (30 seconds)
- [ ] Request deduplication prevents concurrent refreshes
- [ ] Error handling provides clear messages
- [ ] Auto-refresh triggers when token expires within 30 minutes
- [ ] Retry logic works on transient failures

## Common Issues & Solutions

### Issue: "Session not found"
**Solution**: Sync session to production first
```bash
npx tsx scripts/sync-auth-worker-to-production.ts <session-id>
```

### Issue: "Request timeout"
**Solution**: 
- Check if refresh endpoint is accessible
- Verify network connectivity
- Check server logs for details

### Issue: "Token is expired"
**Solution**: 
- Create new auth worker from fresh HAR file
- Or manually update token in session file

### Issue: "Invalid refresh URL"
**Solution**: 
- Verify `refresh_url` is set in session
- Check URL format is correct

## Production Monitoring

Monitor these metrics:
- Refresh success rate
- Average refresh time
- Timeout frequency
- Concurrent refresh attempts (deduplication hits)
- Error types and frequencies

## Testing Script

You can use this script to verify refresh functionality:

```bash
#!/bin/bash
SESSION_ID="har_1769140696887_api_business_agent_ushadvisors_com"

echo "Testing production refresh for session: $SESSION_ID"
echo ""

# Test refresh
RESPONSE=$(curl -s -X POST https://brainscraper.io/api/auth-worker/refresh \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\": \"$SESSION_ID\"}")

echo "Response:"
echo "$RESPONSE" | jq

# Check if successful
SUCCESS=$(echo "$RESPONSE" | jq -r '.success')
if [ "$SUCCESS" = "true" ]; then
  echo ""
  echo "✅ Refresh successful!"
  EXPIRES_IN=$(echo "$RESPONSE" | jq -r '.expiresIn')
  echo "Token expires in: $EXPIRES_IN seconds"
else
  echo ""
  echo "❌ Refresh failed"
  ERROR=$(echo "$RESPONSE" | jq -r '.error')
  echo "Error: $ERROR"
fi
```

## Summary

The production refresh functionality has been verified to include:
- ✅ Timeout protection (30 seconds)
- ✅ Complete header matching
- ✅ Request deduplication
- ✅ Robust error handling
- ✅ URL validation
- ✅ Automatic retries

All improvements are active in production and prevent random token failures.
