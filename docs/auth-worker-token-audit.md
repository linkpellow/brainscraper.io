# Auth Worker Token Handling - Complete Audit

## Overview

The Auth Worker system provides automated token management for authenticated API sessions. It extracts authentication credentials from HAR files, stores them securely, and automatically refreshes tokens before expiration.

## Architecture Components

1. **HAR Processing** (`harToAuthWorker.ts`) - Extracts tokens from HAR files
2. **Server Storage** (`authWorkerServerStorage.ts`) - Persists sessions to disk
3. **Token Refresh Service** (`tokenRefreshService.ts`) - Handles automatic token refresh
4. **API Routes** (`/api/auth-worker/token`, `/api/auth-worker/refresh`) - External access points

---

## Step-by-Step Token Workflow

### Phase 1: Initial Token Extraction (HAR → Session)

#### Step 1.1: HAR File Upload
- User uploads a HAR file containing authenticated requests
- HAR file is processed to extract authentication artifacts

#### Step 1.2: Token Detection Strategy
The system tries multiple strategies in order:

**Strategy 1: OAuth Token Endpoint** (Preferred)
- Searches for POST requests to token endpoints:
  - `/oauth2/v2.0/token` (Microsoft)
  - `/oauth/token`
  - `/connect/token`
  - `/account/refresh`
  - `/account/token`
- Extracts from response:
  - `access_token`
  - `refresh_token` (if available)
  - `expires_in`
  - `token_type`
- Extracts from request:
  - `client_id`
  - `client_secret`
  - `scope`
  - `grant_type`

**Strategy 2: Bearer Token from Headers**
- Searches Authorization headers: `Authorization: Bearer <token>`
- Looks for refresh endpoints in HAR (e.g., `/account/refresh`)
- Extracts `refresh_url` from discovered refresh endpoints

**Strategy 3: Session Cookies**
- Extracts cookies from authenticated requests
- Stores cookie values for session-based auth

**Strategy 4: API Keys**
- Extracts API keys from headers (e.g., `X-API-Key`)

#### Step 1.3: Session Creation
- Creates `PersistedAuthWorkerState` object with:
  ```typescript
  {
    sessionId: string,           // e.g., "har_1769140696887_api_business_agent_ushadvisors_com"
    targetDomain: string,         // e.g., "api-business-agent.ushadvisors.com"
    step2: {
      extractedVars: {
        access_token: string,     // JWT token
        refresh_token?: string,   // OAuth refresh token (if available)
        refresh_url?: string,     // Bearer token refresh endpoint (if available)
        expires_at?: string,      // Unix timestamp (milliseconds)
        expires_in?: string,      // Duration in seconds
        client_id?: string,       // OAuth client ID
        client_secret?: string,    // OAuth client secret
        scope?: string,           // OAuth scope
      },
      endpoint: string,           // Refresh endpoint path
      method: string,             // HTTP method (usually "POST")
      response: object,           // Original token response
      verificationStatus: {
        verifiedAt: number,       // Last verification timestamp
        authenticatedRequestCount: number,
      }
    },
    stabilizedAt: number,        // Session creation timestamp
    apiKey?: string,             // Optional API key for access control
  }
  ```

#### Step 1.4: Expiration Extraction
- **Primary**: Extracts `expires_at` from token response
- **Fallback**: Parses JWT payload to extract `exp` claim
- **Calculation**: If only `expires_in` is available, calculates `expires_at = Date.now() + (expires_in * 1000)`

#### Step 1.5: Server-Side Persistence
- Saves session to `data/auth-workers/{sessionId}.json`
- File includes version metadata and saved timestamp
- Persists across server restarts

---

### Phase 2: Token Retrieval (On-Demand Access)

#### Step 2.1: Token Request
- Client calls: `GET /api/auth-worker/token?sessionId=xxx&apiKey=xxx`
- Or: `GET /api/auth-worker/token?domain=xxx&apiKey=xxx`

#### Step 2.2: Session Lookup
- Loads session from `data/auth-workers/{sessionId}.json`
- Validates API key if present
- Returns 404 if session not found

#### Step 2.3: Token Validation Check
- Calls `getValidToken(sessionId)` which:
  1. Loads session from storage
  2. Checks if token needs refresh via `needsTokenRefresh()`
  3. Returns current token or triggers refresh

#### Step 2.4: Refresh Decision Logic
The `needsTokenRefresh()` function checks:

```typescript
// Base buffer: 30 minutes before expiration
PROACTIVE_REFRESH_BUFFER_MS = 30 * 60 * 1000

// Clock skew detection
clockSkew = detectClockSkew(session)  // Compares JWT exp vs stored expires_at
adjustedNow = Date.now() + clockSkew

// Adaptive buffer (if previous refresh failed)
if (consecutiveFailures > 0) {
  extraBuffer = min(failures * 30min, 2 hours)
  PROACTIVE_REFRESH_BUFFER_MS += extraBuffer
}

// Refresh if expires within buffer window
timeUntilExpiry = expiresAt - adjustedNow
needsRefresh = timeUntilExpiry <= 0 || timeUntilExpiry < PROACTIVE_REFRESH_BUFFER_MS
```

**Refresh triggers:**
- Token expired (`expiresAt <= Date.now()`)
- Token expires within 30 minutes (proactive refresh)
- Previous refresh failures (adaptive buffer increases)

#### Step 2.5: Return Token
- Returns token with metadata:
  ```json
  {
    "success": true,
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "tokenType": "Bearer",
    "expiresIn": 85555,
    "expiresAt": 1769370434000,
    "domain": "api-business-agent.ushadvisors.com",
    "sessionId": "har_1769140696887_api_business_agent_ushadvisors_com",
    "wasRefreshed": false
  }
  ```

---

### Phase 3: Automatic Token Refresh

#### Step 3.1: Refresh Method Detection
The system determines refresh method:

```typescript
function getRefreshMethod(session):
  if (session.step2.extractedVars.refresh_token) {
    return 'oauth'  // Standard OAuth 2.0 refresh_token flow
  }
  if (session.step2.extractedVars.refresh_url) {
    return 'bearer'  // Bearer token refresh flow (custom)
  }
  return 'bearer'  // Default
```

#### Step 3.2: Bearer Token Refresh Flow
**Used for:** Custom implementations (e.g., ushadvisors.com)

**Process:**
1. Extracts current `access_token` from session
2. Checks if token is expired
3. Makes POST request to `refresh_url`:
   ```http
   POST https://api-identity-agent.ushadvisors.com/account/refresh
   Authorization: Bearer {current_access_token}
   Content-Type: application/json
   
   {}
   ```
4. Parses response:
   ```json
   {
     "tokenResult": {
       "access_token": "new_token...",
       "expires_in": 3600
     }
   }
   ```
5. Extracts new token and expiration
6. Updates session with new token

**Error Handling:**
- If expired token rejected (401/403): Returns helpful error suggesting re-authentication
- Retries on network errors (exponential backoff, max 3 attempts)

#### Step 3.3: OAuth Refresh Token Flow
**Used for:** Standard OAuth 2.0 implementations (e.g., Microsoft)

**Process:**
1. Extracts `refresh_token` from session
2. Constructs refresh URL (handles Microsoft-specific URL fixes)
3. Extracts OAuth credentials (`client_id`, `client_secret`, `scope`)
4. Makes POST request with form-urlencoded body:
   ```http
   POST https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token
   Content-Type: application/x-www-form-urlencoded
   
   grant_type=refresh_token
   &refresh_token={refresh_token}
   &client_id={client_id}
   &client_secret={client_secret}
   &scope={scope}
   ```
5. Parses response and updates session

**Microsoft-Specific Handling:**
- Fixes common URL issues (`microsoftonline.com` → `login.microsoftonline.com`)
- Requires `client_id` (logs warning if missing)
- Handles AADSTS error codes with helpful suggestions

#### Step 3.4: Token Verification
**After refresh, verifies new token:**
1. Validates JWT format (3 parts separated by `.`)
2. Parses payload to extract expiration
3. Checks if token is expired
4. If invalid: Retries refresh (up to 3 times with exponential backoff)
5. If still invalid: Tracks failure, returns error

#### Step 3.5: Session Update
**Updates session with new token:**
```typescript
session.step2.extractedVars = {
  ...existingVars,
  access_token: newToken,
  expires_at: expiresAt.toString(),
  expires_in: expiresInSeconds.toString(),
}

session.step2.verificationStatus.verifiedAt = Date.now()
```

**Persistence:**
- Saves updated session to `data/auth-workers/{sessionId}.json`
- Updates both client-side (IndexedDB) and server-side (file) storage

#### Step 3.6: Failure Tracking
**Tracks refresh failures:**
```typescript
refreshFailureTracker.set(sessionId, {
  consecutiveFailures: number,
  lastFailureTime: number,
  lastFailureError: string,
  lastSuccessTime: number,
})
```

**Adaptive Behavior:**
- If 3+ consecutive failures: Logs alert
- Increases refresh buffer on failures (earlier refresh attempts)
- Resets counter on successful refresh

---

### Phase 4: Manual Refresh (API Endpoint)

#### Step 4.1: Refresh Request
- Client calls: `POST /api/auth-worker/refresh`
- Body: `{ "sessionId": "har_1769140696887_api_business_agent_ushadvisors_com" }`

#### Step 4.2: Refresh Execution
- Same process as automatic refresh (Phase 3)
- Returns response:
  ```json
  {
    "success": true,
    "sessionId": "har_1769140696887_api_business_agent_ushadvisors_com",
    "newAccessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 85555,
    "expiresAt": 1769370434000
  }
  ```

---

## Token Storage Locations

### 1. Server-Side Storage (Primary)
- **Location**: `data/auth-workers/{sessionId}.json`
- **Format**: JSON file with full session state
- **Persistence**: Survives server restarts
- **Access**: Server-side only (via `authWorkerServerStorage.ts`)

### 2. Client-Side Storage (Secondary)
- **Location**: IndexedDB (browser)
- **Format**: Same structure as server storage
- **Persistence**: Browser session
- **Access**: Client-side only (via `authWorkerPersistence.ts`)

### 3. In-Memory Cache
- **Location**: `refreshFailureTracker` Map
- **Format**: Failure statistics per session
- **Persistence**: Lost on server restart
- **Purpose**: Adaptive refresh timing

---

## Security Features

### 1. API Key Protection
- Sessions can have optional `apiKey`
- Token endpoint requires matching API key
- Prevents unauthorized token access

### 2. Token Validation
- JWT format validation
- Expiration checking
- Token verification after refresh

### 3. Error Handling
- Retry logic with exponential backoff
- Failure tracking and alerts
- Helpful error messages for common issues

### 4. Clock Skew Detection
- Compares JWT expiration vs stored expiration
- Adjusts refresh timing for clock differences
- Prevents premature refresh failures

---

## Refresh Method Comparison

| Feature | Bearer Token Refresh | OAuth Refresh Token |
|---------|---------------------|---------------------|
| **Endpoint** | Custom refresh URL | OAuth token endpoint |
| **Method** | POST with Bearer token | POST with refresh_token |
| **Body Format** | JSON `{}` | Form-urlencoded or JSON |
| **Credentials** | Current access token | refresh_token + client_id |
| **Use Case** | Custom APIs (ushadvisors.com) | Standard OAuth 2.0 |
| **Expired Token** | May be rejected | Usually accepted |

---

## Key Files Reference

### Core Token Logic
- `app/auth-workers/utils/tokenRefreshService.ts` - Main refresh logic
- `app/auth-workers/utils/authWorkerServerStorage.ts` - Server storage
- `app/auth-workers/utils/authWorkerPersistence.ts` - Client storage

### API Routes
- `app/api/auth-worker/token/route.ts` - Get token endpoint
- `app/api/auth-worker/refresh/route.ts` - Manual refresh endpoint

### HAR Processing
- `app/auth-workers/[sessionId]/map-api/harToAuthWorker.ts` - Extract tokens from HAR

### Integration
- `utils/getUshaToken.ts` - Uses auth worker tokens (Priority 2)
- `utils/ushaAuthWorkerToken.ts` - Helper to get USHA tokens from auth worker

---

## Example: Complete Flow for USHA Token

1. **Initial Setup:**
   ```
   User logs into agent.ushadvisors.com → Captures HAR → Uploads HAR
   ```

2. **Token Extraction:**
   ```
   HAR → Detects Bearer token in Authorization header
   → Finds refresh endpoint: /account/refresh
   → Creates session with access_token + refresh_url
   ```

3. **Token Usage:**
   ```
   API call needs token → Calls getValidToken()
   → Checks expiration (30min buffer)
   → Returns current token (or refreshes if needed)
   ```

4. **Automatic Refresh:**
   ```
   Token expires in 25 minutes → needsTokenRefresh() = true
   → Calls refreshBearerToken()
   → POST to refresh_url with current token
   → Updates session with new token
   → Returns new token to caller
   ```

5. **Failure Handling:**
   ```
   Refresh fails → Retries 3 times (exponential backoff)
   → Tracks failure → Increases refresh buffer
   → Logs alert if 3+ consecutive failures
   ```

---

## Best Practices

1. **Proactive Refresh**: Tokens refresh 30 minutes before expiration
2. **Adaptive Timing**: Failed refreshes trigger earlier attempts
3. **Clock Skew Tolerance**: Handles server clock differences
4. **Retry Logic**: Network errors retry with exponential backoff
5. **Token Verification**: Validates refreshed tokens before saving
6. **Failure Tracking**: Monitors and alerts on persistent failures

---

## Common Issues & Solutions

### Issue: Token Expired
**Symptom**: Refresh fails with 401/403  
**Solution**: Re-authenticate and create new session from fresh HAR

### Issue: Missing client_id (Microsoft OAuth)
**Symptom**: AADSTS9002313 error  
**Solution**: Recreate auth worker from HAR that includes OAuth token exchange request

### Issue: Refresh URL Not Found
**Symptom**: "No refresh capability found"  
**Solution**: Ensure HAR includes refresh endpoint requests

### Issue: Clock Skew
**Symptom**: Premature refresh failures  
**Solution**: System automatically detects and adjusts (5min tolerance)

---

## Summary

The Auth Worker token system provides:
- ✅ **Automatic token extraction** from HAR files
- ✅ **Proactive refresh** (30min before expiration)
- ✅ **Multiple refresh methods** (Bearer + OAuth)
- ✅ **Failure resilience** (retries + adaptive timing)
- ✅ **Security** (API keys + validation)
- ✅ **Persistence** (survives restarts)
- ✅ **Monitoring** (failure tracking + alerts)

The system is production-ready and handles edge cases like expired tokens, clock skew, and network failures gracefully.
