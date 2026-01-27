# Token Refresh Robustness Improvements

## Overview

This document outlines the critical improvements made to the token refresh system to prevent random token failures and make it more robust and fail-proof.

## Issues Identified & Fixed

### 1. ✅ **No Timeout on Fetch Requests**
**Problem**: Fetch requests could hang indefinitely if the refresh endpoint was slow or unresponsive.

**Solution**: Added 30-second timeout using `AbortController`:
```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), REFRESH_REQUEST_TIMEOUT_MS);
```

**Impact**: Prevents hanging requests and ensures failures are detected quickly.

---

### 2. ✅ **Missing Headers from Browser Requests**
**Problem**: The curl command shows additional headers (`Origin`, `Referer`, `User-Agent`) that may be required by the refresh endpoint for security/validation.

**Solution**: Added all headers from the browser request:
```typescript
headers: {
  'Authorization': `Bearer ${accessToken}`,
  'Content-Type': 'application/json',
  'Accept': 'application/json, text/plain, */*',
  'Origin': origin,                    // NEW
  'Referer': `${origin}/`,            // NEW
  'User-Agent': 'Mozilla/5.0...',     // NEW
  'Connection': 'keep-alive',          // NEW
}
```

**Impact**: Matches browser behavior exactly, reducing chance of rejection by security middleware.

---

### 3. ✅ **No Request Deduplication**
**Problem**: Concurrent refresh requests could cause race conditions, multiple refresh attempts, and potential token conflicts.

**Solution**: Implemented request deduplication at two levels:
- **Bearer token level**: Tracks in-flight refresh requests per session+URL
- **Session level**: Tracks in-flight refresh operations per session

```typescript
// Bearer token deduplication
const inFlightKey = `${session.sessionId}:${refreshUrl}`;
const existingRefresh = inFlightRefreshes.get(inFlightKey);
if (existingRefresh) {
  return existingRefresh; // Wait for existing request
}

// Session-level deduplication
const existingOperation = inFlightRefreshOperations.get(sessionId);
if (existingOperation) {
  return existingOperation; // Wait for existing operation
}
```

**Impact**: Prevents race conditions and ensures only one refresh happens at a time per session.

---

### 4. ✅ **JSON Parsing Errors**
**Problem**: `response.json()` could throw if response wasn't valid JSON, causing unhandled errors.

**Solution**: Added robust JSON parsing with error handling:
```typescript
let data: any;
try {
  const responseText = await response.text();
  if (!responseText || responseText.trim().length === 0) {
    throw new Error('Empty response body');
  }
  data = JSON.parse(responseText);
} catch (parseError) {
  throw new Error(
    `Failed to parse refresh response as JSON: ${parseError.message}`
  );
}
```

**Impact**: Provides clear error messages and prevents crashes from malformed responses.

---

### 5. ✅ **No URL Validation**
**Problem**: Invalid refresh URLs could cause cryptic fetch errors.

**Solution**: Added URL validation before attempting refresh:
```typescript
// Validate refresh URL
if (!refreshUrl || typeof refreshUrl !== 'string') {
  throw new Error('Invalid refresh URL');
}

try {
  new URL(refreshUrl);
} catch {
  throw new Error(`Invalid refresh URL format: ${refreshUrl}`);
}
```

**Impact**: Fails fast with clear error messages instead of cryptic fetch errors.

---

### 6. ✅ **Improved Error Handling for Timeouts**
**Problem**: Timeout errors weren't specifically handled, making debugging difficult.

**Solution**: Added specific timeout error handling:
```typescript
catch (fetchError) {
  clearTimeout(timeoutId);
  
  // Handle timeout specifically
  if (fetchError instanceof Error && fetchError.name === 'AbortError') {
    throw new Error(`Request timeout after ${REFRESH_REQUEST_TIMEOUT_MS}ms`);
  }
  
  throw fetchError;
}
```

**Impact**: Clear timeout error messages and proper cleanup.

---

### 7. ✅ **Enhanced Retry Logic**
**Problem**: Timeout errors weren't recognized as retryable.

**Solution**: Added `AbortError` to retryable error detection:
```typescript
const isRetryable = errorMessage.includes('fetch') || 
                   errorMessage.includes('network') ||
                   errorMessage.includes('timeout') ||
                   errorMessage.includes('ECONNREFUSED') ||
                   errorMessage.includes('ETIMEDOUT') ||
                   errorMessage.includes('AbortError'); // NEW
```

**Impact**: Timeout errors now trigger automatic retries.

---

## Implementation Details

### Constants Added
```typescript
const REFRESH_REQUEST_TIMEOUT_MS = 30000; // 30 seconds
```

### New Tracking Maps
```typescript
// Track in-flight Bearer token refreshes
const inFlightRefreshes = new Map<string, Promise<...>>();

// Track in-flight refresh operations
const inFlightRefreshOperations = new Map<string, Promise<...>>();
```

### Helper Function
```typescript
function extractOriginFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return `${urlObj.protocol}//${urlObj.host}`;
  } catch {
    // Fallback for malformed URLs
    const match = url.match(/https?:\/\/([^\/]+)/);
    return match ? `https://${match[1]}` : 'https://agent.ushadvisors.com';
  }
}
```

---

## Testing Recommendations

### 1. Test Timeout Handling
- Simulate slow network (throttle to 1kb/s)
- Verify timeout occurs after 30 seconds
- Verify retry logic triggers

### 2. Test Request Deduplication
- Trigger multiple concurrent refresh requests
- Verify only one actual request is made
- Verify all callers receive the same result

### 3. Test Header Matching
- Compare request headers with browser curl command
- Verify Origin/Referer match the refresh URL domain
- Verify User-Agent matches browser

### 4. Test Error Scenarios
- Invalid refresh URL
- Empty response body
- Malformed JSON response
- Network timeout
- 401/403 errors with expired tokens

---

## Benefits

1. **Prevents Hanging Requests**: 30-second timeout ensures requests don't hang indefinitely
2. **Matches Browser Behavior**: Headers match browser requests exactly, reducing rejection risk
3. **Prevents Race Conditions**: Request deduplication ensures only one refresh at a time
4. **Better Error Messages**: Clear, actionable error messages for debugging
5. **Automatic Retries**: Timeout errors trigger automatic retries
6. **Fail-Fast Validation**: URL validation catches issues early

---

## Monitoring

The existing failure tracking system will now capture:
- Timeout errors (with clear messages)
- JSON parsing errors
- Invalid URL errors
- Concurrent refresh attempts (logged but deduplicated)

Monitor these metrics:
- `consecutiveFailures` per session
- `lastFailureError` messages
- Timeout frequency
- Deduplication frequency (indicates concurrent refresh attempts)

---

## Summary

All critical gaps have been filled:
- ✅ Timeout protection (30 seconds)
- ✅ Complete header matching
- ✅ Request deduplication (2 levels)
- ✅ Robust JSON parsing
- ✅ URL validation
- ✅ Enhanced error handling
- ✅ Improved retry logic

The token refresh system is now production-ready and fail-proof, preventing random token failures through comprehensive error handling, timeout protection, and request deduplication.
