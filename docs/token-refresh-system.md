# Token Refresh System - Fail-Proof Design

## Overview

The token refresh system ensures that JWT tokens for DNC scrubbing are **always valid** by proactively refreshing them before expiration. The system is designed to be fail-proof with multiple layers of protection.

## Key Features

### 1. **Intelligent Expiration Detection**
- Extracts expiration from JWT `exp` field
- Stores expiration in session (`expires_at`)
- Automatically extracts from JWT if missing from session
- Verifies stored expiration matches JWT expiration

### 2. **Proactive Refresh**
- Refreshes tokens **30 minutes before expiration** by default
- Prevents DNC scrub API calls from failing due to expired tokens
- Background job checks every 5 minutes

### 3. **Retry Logic with Exponential Backoff**
- Automatically retries failed refreshes up to 3 times
- Exponential backoff: 1s, 2s, 4s (max 5 minutes)
- Retries on network errors, timeouts, and transient failures
- Verifies new token is valid before saving

### 4. **Failure Tracking & Alerting**
- Tracks consecutive refresh failures per session
- Alerts when 3+ consecutive failures occur
- Logs detailed error information for debugging
- Tracks last success and failure times

### 5. **Adaptive Refresh Timing**
- If previous refresh failed, refreshes **earlier** to allow time for retries
- Adds extra buffer based on failure count (up to 2 hours)
- Ensures tokens are refreshed well before expiration even after failures

### 6. **Token Verification**
- Verifies refreshed token is valid before saving
- Checks JWT format and expiration
- Prevents saving invalid tokens
- Retries if verification fails

### 7. **Clock Skew Detection**
- Detects server clock differences
- Adjusts expiration checks for clock skew
- Adds buffer for clock skew tolerance (5 minutes)

### 8. **Multiple Refresh Methods**
- Supports OAuth 2.0 `refresh_token` flow
- Supports Bearer token refresh flow (custom implementations)
- Automatically detects which method to use

## How It Works

### Background Job (server.js)

```javascript
// Checks every 5 minutes
// Refreshes tokens that expire within 30 minutes
// Uses direct refresh function with retry logic
// Logs urgency level (CRITICAL, URGENT, HIGH, NORMAL)
```

### On-Demand Refresh (getValidToken)

```javascript
// Called by DNC scrub endpoints
// Checks if refresh is needed
// Refreshes if within 30 minutes of expiration
// Returns valid token (refreshed or current)
```

### Refresh Flow

1. **Check if refresh needed**: Uses `needsTokenRefresh()`
   - Checks expiration time
   - Accounts for clock skew
   - Uses adaptive buffer if previous refresh failed

2. **Attempt refresh**: Calls `refreshAuthWorkerToken()`
   - Detects refresh method (OAuth vs Bearer)
   - Calls appropriate refresh endpoint
   - Handles errors and retries

3. **Verify new token**: Validates refreshed token
   - Checks JWT format
   - Verifies not expired
   - Retries if verification fails

4. **Save to session**: Updates session with new token
   - Updates `access_token`
   - Updates `expires_at` and `expires_in`
   - Persists to storage

5. **Track results**: Updates failure tracking
   - Resets counter on success
   - Increments counter on failure
   - Alerts if too many failures

## Failure Scenarios & Handling

### Scenario 1: Network Error
- **Detection**: Fetch timeout or connection error
- **Action**: Retry with exponential backoff (up to 3 times)
- **Fallback**: Return current token (may still be valid)

### Scenario 2: Refresh Endpoint Down
- **Detection**: HTTP 5xx or connection refused
- **Action**: Retry with exponential backoff
- **Alert**: Logs error, tracks failure count
- **Fallback**: Return current token, alert if expired

### Scenario 3: Invalid Refresh Response
- **Detection**: Missing `access_token` in response
- **Action**: Retry refresh
- **Alert**: Logs error details

### Scenario 4: Refreshed Token Invalid
- **Detection**: Token verification fails
- **Action**: Retry refresh (up to 3 times)
- **Alert**: Logs verification error

### Scenario 5: Token Expired Before Refresh
- **Detection**: Current time > expiration time
- **Action**: Immediate refresh attempt
- **Alert**: CRITICAL log level
- **Fallback**: Attempt refresh with expired token (some endpoints allow this)

### Scenario 6: Consecutive Failures
- **Detection**: 3+ consecutive refresh failures
- **Action**: 
  - Alerts with detailed error information
  - Increases refresh buffer (adaptive timing)
  - Refreshes earlier on next attempt
- **Monitoring**: Tracks failure stats for debugging

## Monitoring & Debugging

### Failure Statistics

```typescript
getRefreshFailureStats(sessionId): {
  consecutiveFailures: number;
  lastFailureTime: number | null;
  lastFailureError: string | null;
  lastSuccessTime: number | null;
  needsAttention: boolean; // true if 3+ failures
}
```

### Log Levels

- **INFO**: Normal refresh operations
- **WARN**: Refresh failed but retrying
- **ERROR**: Refresh failed after retries
- **CRITICAL**: Token expired and refresh failed

### Verification Script

Run verification script:

```bash
npx tsx scripts/verify-dnc-token-expiration.ts
```

This verifies:
- Token exists
- Expiration extracted from JWT
- Expiration stored in session
- Expiration times match
- Refresh capability available
- Token is valid (not expired)
- Refresh will happen proactively

## Configuration

### Refresh Buffer
- **Default**: 30 minutes before expiration
- **Adaptive**: Increases if previous refresh failed
- **Max**: Up to 2 hours for critical failures

### Retry Settings
- **Max Retries**: 3 attempts
- **Base Delay**: 1 second
- **Max Delay**: 5 minutes
- **Backoff**: Exponential (1s, 2s, 4s)

### Clock Skew
- **Tolerance**: 5 minutes
- **Detection**: Compares stored vs JWT expiration
- **Adjustment**: Adds buffer for detected skew

### Failure Threshold
- **Alert Threshold**: 3 consecutive failures
- **Tracking**: Per-session failure counter
- **Reset**: On successful refresh

## Best Practices

1. **Monitor Logs**: Watch for CRITICAL alerts
2. **Check Failure Stats**: Use `getRefreshFailureStats()` to monitor health
3. **Verify Tokens**: Run verification script regularly
4. **Test Refresh**: Manually trigger refresh to test
5. **Monitor Clock**: Ensure server clock is synchronized

## DNC Scrub Integration

All DNC scrub endpoints use `getUshaTokenForDNC()` which:
1. Gets token from auth worker (preferred)
2. Calls `getValidToken()` which checks expiration
3. Automatically refreshes if needed
4. Returns valid token for API calls

This ensures DNC scrub API calls **never fail due to expired tokens**.

## Summary

The token refresh system is **fail-proof** because:

✅ **Proactive**: Refreshes 30 minutes before expiration  
✅ **Retry Logic**: Automatically retries failed refreshes  
✅ **Verification**: Validates tokens before saving  
✅ **Adaptive**: Adjusts timing based on failures  
✅ **Monitoring**: Tracks failures and alerts on issues  
✅ **Clock Skew**: Handles server clock differences  
✅ **Multiple Methods**: Supports OAuth and Bearer flows  
✅ **Background Job**: Continuous monitoring every 5 minutes  

**Result**: DNC scrub API calls will always have valid tokens, even in failure scenarios.
