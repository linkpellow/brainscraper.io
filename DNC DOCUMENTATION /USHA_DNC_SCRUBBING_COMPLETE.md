# USHA DNC Scrubbing - Complete Guide

## 📋 Table of Contents

1. [Overview](#overview)
2. [Token Authentication](#token-authentication)
3. [Automatic Token Refresh](#automatic-token-refresh)
4. [DNC Scrubbing Process](#dnc-scrubbing-process)
5. [API Endpoints](#api-endpoints)
6. [Terminal Code Snippets](#terminal-code-snippets)
7. [Error Handling](#error-handling)
8. [Best Practices](#best-practices)

---

## Overview

The USHA DNC scrubbing system automatically checks phone numbers against the Do Not Call registry. The system handles token authentication, automatic refresh, and seamless error recovery.

### Key Features

- ✅ **Automatic Token Management**: Handles authentication tokens with automatic refresh
- ✅ **Seamless Error Recovery**: Automatically refreshes tokens on authentication failures
- ✅ **Multiple Authentication Methods**: Supports Cognito, OAuth, and environment variables
- ✅ **Caching**: Tokens are cached to minimize API calls
- ✅ **Batch Processing**: Supports single and batch phone number scrubbing

---

## Token Authentication

### Authentication Priority Order

The system uses the following priority order to obtain a valid token:

1. **Provided Token** (request parameter) - Highest priority
2. **Cached Token** (if still valid)
3. **Environment Variable** (`USHA_JWT_TOKEN` or `COGNITO_ID_TOKEN`)
4. **Cognito Authentication** (automatic refresh via `COGNITO_REFRESH_TOKEN`) ← **RECOMMENDED**
5. **Direct OAuth** (`USHA_USERNAME/USHA_PASSWORD` or `USHA_CLIENT_ID/USHA_CLIENT_SECRET`)

### Configuration

**Recommended Setup** (for production):

```bash
# Add to .env.local
COGNITO_REFRESH_TOKEN=your-refresh-token-here
```

**Alternative Setup** (temporary token):

```bash
# Add to .env.local
USHA_JWT_TOKEN=your-jwt-token-here
```

**Full Configuration Options**:

```bash
# Cognito (Recommended - automatic refresh)
COGNITO_REFRESH_TOKEN=eyJjdHkiOiJKV1QiLCJlbmMiOiJBMjU2R0NNIiwiYWxnIjoiUl...
COGNITO_USERNAME=your-email@ushadvisors.com
COGNITO_PASSWORD=your-password

# Direct OAuth (Alternative)
USHA_USERNAME=your-email@ushadvisors.com
USHA_PASSWORD=your-password
USHA_CLIENT_ID=your-client-id
USHA_CLIENT_SECRET=your-client-secret

# Temporary Token (Fallback)
USHA_JWT_TOKEN=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Token Caching

- Tokens are cached in memory (server-side only)
- Cache includes expiration time
- System automatically refreshes tokens before expiration
- Cache is cleared on forced refresh

---

## Automatic Token Refresh

### How It Works

1. **Token Expiration Detection**: System checks token expiration before use
2. **Automatic Refresh**: If token is expired or invalid, system automatically:
   - Uses Cognito refresh token to get new ID token
   - Falls back to OAuth if Cognito fails
   - Updates cache with new token
3. **Seamless Recovery**: If API call fails with 401, system:
   - Clears token cache
   - Refreshes token
   - Retries the request automatically

### Refresh Token Flow

```
Token Request → Check Cache → Check Env Var → Cognito Refresh → OAuth → Error
     ↓              ↓              ↓              ↓            ↓        ↓
  Use Token    Use Token      Use Token      Get New      Get New   Throw Error
```

### Token Refresh Triggers

- Token expiration (checked before each API call)
- 401 Unauthorized response (automatic retry with refresh)
- Force refresh parameter (`forceRefresh: true`)
- Cache expiration

---

## DNC Scrubbing Process

### Single Phone Number Scrub

**Endpoint**: `GET /api/usha/scrub-phone`

**Parameters**:
- `phone` (required): Phone number to check (digits only, no formatting)
- `currentContextAgentNumber` (optional): Agent number (default: `00044447`)
- `token` (optional): Override token (uses automatic token management if not provided)

**Response**:
```json
{
  "success": true,
  "phone": "2143493972",
  "isDNC": false,
  "canContact": true,
  "status": "OK",
  "reason": null,
  "data": { /* USHA API response */ }
}
```

### Batch Phone Number Scrub

**Endpoint**: `POST /api/usha/scrub-batch`

**Request Body**:
```json
{
  "phoneNumbers": ["2143493972", "2145551234", "2145555678"]
}
```

**Response**:
```json
{
  "success": true,
  "results": [
    {
      "phone": "2143493972",
      "isDNC": false,
      "canContact": true,
      "status": "OK"
    },
    {
      "phone": "2145551234",
      "isDNC": true,
      "canContact": false,
      "status": "DNC",
      "reason": "Federal DNC"
    }
  ],
  "stats": {
    "total": 3,
    "success": 3,
    "failed": 0,
    "dnc": 1,
    "ok": 2
  }
}
```

### DNC Status Values

- `isDNC`: `true` if number is on DNC list, `false` otherwise
- `canContact`: `true` if contact is allowed, `false` if DNC
- `status`: `"OK"` or `"DNC"`
- `reason`: Reason for DNC status (e.g., "Federal DNC", "State DNC")

---

## API Endpoints

### 1. Single Phone Scrub

```
GET /api/usha/scrub-phone?phone=2143493972&currentContextAgentNumber=00044447
```

### 2. Batch Phone Scrub

```
POST /api/usha/scrub-batch
Content-Type: application/json

{
  "phoneNumbers": ["2143493972", "2145551234"]
}
```

### 3. Direct USHA API (with token)

```
GET https://api-business-agent.ushadvisors.com/Leads/api/leads/scrubphonenumber?currentContextAgentNumber=00044447&phone=2143493972
Authorization: Bearer <token>
Origin: https://agent.ushadvisors.com
Referer: https://agent.ushadvisors.com
```

---

## Terminal Code Snippets

### 1. Scrub Single Phone Number

**Standalone script** for scrubbing a single phone number:

```bash
#!/bin/bash
# File: scrub-phone.sh
# Usage: ./scrub-phone.sh <phone-number> [agent-number]

PHONE="${1:-2143493972}"
AGENT_NUMBER="${2:-00044447}"
BASE_URL="${NEXT_PUBLIC_BASE_URL:-http://localhost:3000}"

echo "🔍 Scrubbing phone number: $PHONE"
echo "📞 Agent number: $AGENT_NUMBER"
echo ""

RESPONSE=$(curl -s -X GET \
  "${BASE_URL}/api/usha/scrub-phone?phone=${PHONE}&currentContextAgentNumber=${AGENT_NUMBER}")

SUCCESS=$(echo "$RESPONSE" | jq -r '.success // false')
IS_DNC=$(echo "$RESPONSE" | jq -r '.isDNC // false')
STATUS=$(echo "$RESPONSE" | jq -r '.status // "UNKNOWN"')
REASON=$(echo "$RESPONSE" | jq -r '.reason // ""')

if [ "$SUCCESS" = "true" ]; then
  echo "✅ Scrub successful!"
  echo "   Phone: $PHONE"
  echo "   DNC Status: $STATUS"
  echo "   Is DNC: $IS_DNC"
  if [ -n "$REASON" ] && [ "$REASON" != "null" ]; then
    echo "   Reason: $REASON"
  fi
else
  echo "❌ Scrub failed!"
  echo "$RESPONSE" | jq '.'
  exit 1
fi
```

**Node.js/TypeScript version**:

```typescript
// File: scrub-phone.ts
// Usage: npx tsx scrub-phone.ts <phone-number> [agent-number]

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const phone = process.argv[2] || '2143493972';
const agentNumber = process.argv[3] || '00044447';
const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

async function scrubPhone() {
  console.log(`🔍 Scrubbing phone number: ${phone}`);
  console.log(`📞 Agent number: ${agentNumber}\n`);

  try {
    const url = `${baseUrl}/api/usha/scrub-phone?phone=${encodeURIComponent(phone)}&currentContextAgentNumber=${encodeURIComponent(agentNumber)}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const result = await response.json();

    if (result.success) {
      console.log('✅ Scrub successful!');
      console.log(`   Phone: ${result.phone}`);
      console.log(`   DNC Status: ${result.status}`);
      console.log(`   Is DNC: ${result.isDNC}`);
      if (result.reason) {
        console.log(`   Reason: ${result.reason}`);
      }
    } else {
      console.error('❌ Scrub failed!');
      console.error(JSON.stringify(result, null, 2));
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

scrubPhone();
```

---

### 2. Refresh Token

**Standalone script** for refreshing the token:

```bash
#!/bin/bash
# File: refresh-token.sh
# Usage: ./refresh-token.sh

BASE_URL="${NEXT_PUBLIC_BASE_URL:-http://localhost:3000}"

echo "🔄 Refreshing USHA token..."
echo ""

# Note: Token refresh happens automatically via getUshaToken()
# This script tests the token retrieval system

RESPONSE=$(curl -s -X GET \
  "${BASE_URL}/api/usha/scrub-phone?phone=2143493972" \
  -H "Content-Type: application/json")

SUCCESS=$(echo "$RESPONSE" | jq -r '.success // false')

if [ "$SUCCESS" = "true" ]; then
  echo "✅ Token is valid and working!"
  echo "   Token was automatically retrieved/refreshed"
else
  ERROR=$(echo "$RESPONSE" | jq -r '.error // "Unknown error"')
  echo "❌ Token refresh failed!"
  echo "   Error: $ERROR"
  echo ""
  echo "💡 Check your .env.local configuration:"
  echo "   - COGNITO_REFRESH_TOKEN (recommended)"
  echo "   - USHA_JWT_TOKEN (temporary)"
  exit 1
fi
```

**Node.js/TypeScript version** (direct token refresh):

```typescript
// File: refresh-token.ts
// Usage: npx tsx refresh-token.ts

import * as dotenv from 'dotenv';
import * as path from 'path';
import { getUshaToken, clearTokenCache } from './utils/getUshaToken';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function refreshToken() {
  console.log('🔄 Refreshing USHA token...\n');

  try {
    // Clear cache to force refresh
    clearTokenCache();
    console.log('✅ Token cache cleared\n');

    // Get fresh token (will trigger refresh if needed)
    const token = await getUshaToken(null, true); // forceRefresh = true

    if (token) {
      console.log('✅ Token refreshed successfully!');
      console.log(`   Token: ${token.substring(0, 50)}...`);
      console.log(`   Length: ${token.length} characters`);
      
      // Decode token to show expiration
      try {
        const parts = token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
          if (payload.exp) {
            const expiration = new Date(payload.exp * 1000);
            const now = new Date();
            const expiresIn = Math.floor((payload.exp * 1000 - now.getTime()) / 1000 / 60);
            console.log(`   Expires: ${expiration.toISOString()}`);
            console.log(`   Expires in: ${expiresIn} minutes`);
          }
        }
      } catch (e) {
        // Couldn't decode, but token is valid
      }
    } else {
      throw new Error('Token is null or undefined');
    }
  } catch (error) {
    console.error('❌ Token refresh failed!');
    console.error(`   Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.error('\n💡 Check your .env.local configuration:');
    console.error('   - COGNITO_REFRESH_TOKEN (recommended)');
    console.error('   - USHA_JWT_TOKEN (temporary)');
    process.exit(1);
  }
}

refreshToken();
```

---

### 3. Hybrid: Scrub with Auto-Refresh on Error

**Standalone script** that scrubs a phone number and automatically refreshes token on error:

```bash
#!/bin/bash
# File: scrub-with-auto-refresh.sh
# Usage: ./scrub-with-auto-refresh.sh <phone-number> [agent-number]

PHONE="${1:-2143493972}"
AGENT_NUMBER="${2:-00044447}"
BASE_URL="${NEXT_PUBLIC_BASE_URL:-http://localhost:3000}"
MAX_RETRIES=2

echo "🔍 Scrubbing phone number: $PHONE"
echo "📞 Agent number: $AGENT_NUMBER"
echo ""

scrub_phone() {
  local attempt=$1
  local force_refresh=$2
  
  if [ "$force_refresh" = "true" ]; then
    echo "🔄 Forcing token refresh before attempt $attempt..."
  fi
  
  RESPONSE=$(curl -s -X GET \
    "${BASE_URL}/api/usha/scrub-phone?phone=${PHONE}&currentContextAgentNumber=${AGENT_NUMBER}${force_refresh:+&forceRefresh=true}")
  
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -X GET \
    "${BASE_URL}/api/usha/scrub-phone?phone=${PHONE}&currentContextAgentNumber=${AGENT_NUMBER}")
  
  SUCCESS=$(echo "$RESPONSE" | jq -r '.success // false')
  ERROR=$(echo "$RESPONSE" | jq -r '.error // ""')
  
  if [ "$SUCCESS" = "true" ]; then
    IS_DNC=$(echo "$RESPONSE" | jq -r '.isDNC // false')
    STATUS=$(echo "$RESPONSE" | jq -r '.status // "UNKNOWN"')
    REASON=$(echo "$RESPONSE" | jq -r '.reason // ""')
    
    echo "✅ Scrub successful!"
    echo "   Phone: $PHONE"
    echo "   DNC Status: $STATUS"
    echo "   Is DNC: $IS_DNC"
    if [ -n "$REASON" ] && [ "$REASON" != "null" ]; then
      echo "   Reason: $REASON"
    fi
    return 0
  elif [ "$HTTP_STATUS" = "401" ] || [ -n "$ERROR" ]; then
    echo "⚠️  Authentication error (attempt $attempt)"
    if [ "$attempt" -lt "$MAX_RETRIES" ]; then
      echo "🔄 Retrying with token refresh..."
      sleep 1
      return 1
    else
      echo "❌ Max retries reached. Scrub failed!"
      echo "$RESPONSE" | jq '.'
      return 2
    fi
  else
    echo "❌ Scrub failed!"
    echo "$RESPONSE" | jq '.'
    return 2
  fi
}

# Attempt 1: Try without refresh
if ! scrub_phone 1 false; then
  # Attempt 2: Retry with refresh
  if ! scrub_phone 2 true; then
    exit 1
  fi
fi
```

**Node.js/TypeScript version** (with automatic retry):

```typescript
// File: scrub-with-auto-refresh.ts
// Usage: npx tsx scrub-with-auto-refresh.ts <phone-number> [agent-number]

import * as dotenv from 'dotenv';
import * as path from 'path';
import { getUshaToken, clearTokenCache } from './utils/getUshaToken';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const phone = process.argv[2] || '2143493972';
const agentNumber = process.argv[3] || '00044447';
const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
const MAX_RETRIES = 2;

async function scrubPhoneWithAutoRefresh(attempt: number = 1, forceRefresh: boolean = false): Promise<boolean> {
  console.log(`\n🔍 Attempt ${attempt}: Scrubbing phone number: ${phone}`);
  console.log(`📞 Agent number: ${agentNumber}`);

  if (forceRefresh) {
    console.log('🔄 Forcing token refresh...');
    clearTokenCache();
  }

  try {
    // Get token (will auto-refresh if needed)
    const token = await getUshaToken(null, forceRefresh);
    
    if (!token) {
      throw new Error('Failed to obtain token');
    }

    // Build USHA API URL
    const cleanedPhone = phone.replace(/\D/g, '');
    const url = `https://api-business-agent.ushadvisors.com/Leads/api/leads/scrubphonenumber?currentContextAgentNumber=${encodeURIComponent(agentNumber)}&phone=${encodeURIComponent(cleanedPhone)}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Origin': 'https://agent.ushadvisors.com',
        'Referer': 'https://agent.ushadvisors.com',
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      
      // If 401 and we haven't retried yet, try again with refresh
      if (response.status === 401 && attempt < MAX_RETRIES) {
        console.log(`⚠️  Authentication error (${response.status})`);
        console.log('🔄 Retrying with token refresh...');
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
        return scrubPhoneWithAutoRefresh(attempt + 1, true);
      }
      
      throw new Error(`USHA API error: ${response.status} ${response.statusText} - ${errorText.substring(0, 200)}`);
    }

    const result = await response.json();
    
    // Parse response
    const responseData = result.data || result;
    const isDNC = responseData.isDoNotCall === true || 
                 responseData.contactStatus?.canContact === false ||
                 result.isDNC === true || 
                 result.isDoNotCall === true;
    const canContact = responseData.contactStatus?.canContact !== false && !isDNC;
    const reason = responseData.contactStatus?.reason || responseData.reason || (isDNC ? 'Do Not Call' : undefined);
    const status = isDNC ? 'DNC' : 'OK';

    console.log('\n✅ Scrub successful!');
    console.log(`   Phone: ${cleanedPhone}`);
    console.log(`   DNC Status: ${status}`);
    console.log(`   Is DNC: ${isDNC}`);
    console.log(`   Can Contact: ${canContact}`);
    if (reason) {
      console.log(`   Reason: ${reason}`);
    }
    
    return true;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    
    // If we haven't retried yet and it's an auth error, try again
    if (attempt < MAX_RETRIES && (errorMsg.includes('401') || errorMsg.includes('Unauthorized') || errorMsg.includes('token'))) {
      console.log(`⚠️  Error: ${errorMsg}`);
      console.log('🔄 Retrying with token refresh...');
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      return scrubPhoneWithAutoRefresh(attempt + 1, true);
    }
    
    console.error(`\n❌ Scrub failed after ${attempt} attempt(s)!`);
    console.error(`   Error: ${errorMsg}`);
    
    if (attempt >= MAX_RETRIES) {
      console.error('\n💡 Max retries reached. Check your configuration:');
      console.error('   - COGNITO_REFRESH_TOKEN (recommended)');
      console.error('   - USHA_JWT_TOKEN (temporary)');
    }
    
    return false;
  }
}

async function main() {
  const success = await scrubPhoneWithAutoRefresh(1, false);
  process.exit(success ? 0 : 1);
}

main();
```

---

## Error Handling

### Common Errors

1. **401 Unauthorized**
   - **Cause**: Token expired or invalid
   - **Solution**: System automatically refreshes token and retries
   - **Manual Fix**: Ensure `COGNITO_REFRESH_TOKEN` is set in `.env.local`

2. **400 Bad Request**
   - **Cause**: Invalid phone number format
   - **Solution**: Ensure phone number is at least 10 digits (digits only)

3. **500 Internal Server Error**
   - **Cause**: Token fetch failed or USHA API error
   - **Solution**: Check token configuration and USHA API status

### Error Response Format

```json
{
  "error": "Error message",
  "details": "Additional error details",
  "status": 401
}
```

---

## Best Practices

### 1. Token Configuration

✅ **Recommended**: Use `COGNITO_REFRESH_TOKEN` for automatic token management
```bash
COGNITO_REFRESH_TOKEN=your-refresh-token-here
```

❌ **Not Recommended**: Using temporary `USHA_JWT_TOKEN` (expires and requires manual updates)

### 2. Phone Number Formatting

✅ **Correct**: `2143493972` (digits only, no formatting)
❌ **Incorrect**: `(214) 349-3972`, `214-349-3972`, `+1 214 349 3972`

### 3. Batch Processing

- Use batch endpoint for multiple phone numbers
- Batch size: 10-50 phone numbers per request
- Add delays between batches to avoid rate limiting

### 4. Error Handling

- Always check `success` field in response
- Handle 401 errors with automatic retry
- Log errors for debugging

### 5. Rate Limiting

- USHA API may have rate limits
- Add delays between requests in batch processing
- Monitor API response times

---

## Integration Examples

### In Your Application

```typescript
import { getUshaToken } from '@/utils/getUshaToken';

async function scrubPhoneNumber(phone: string) {
  try {
    // Get token automatically (handles refresh)
    const token = await getUshaToken();
    
    const cleanedPhone = phone.replace(/\D/g, '');
    const url = `https://api-business-agent.ushadvisors.com/Leads/api/leads/scrubphonenumber?currentContextAgentNumber=00044447&phone=${cleanedPhone}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Origin': 'https://agent.ushadvisors.com',
        'Referer': 'https://agent.ushadvisors.com',
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      // If 401, token might be expired - getUshaToken will handle refresh on next call
      throw new Error(`USHA API error: ${response.status}`);
    }
    
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('DNC scrub error:', error);
    throw error;
  }
}
```

---

## Summary

✅ **Token Management**: Automatic with Cognito refresh token (recommended)
✅ **Error Recovery**: Automatic retry with token refresh on 401 errors
✅ **Phone Format**: Digits only, no formatting required
✅ **Batch Support**: Process multiple phone numbers efficiently
✅ **Caching**: Tokens are cached to minimize API calls

**Quick Start**:
1. Set `COGNITO_REFRESH_TOKEN` in `.env.local`
2. Use `/api/usha/scrub-phone` endpoint
3. System handles token refresh automatically

**For Production**:
- Use Cognito refresh token for automatic token management
- Implement retry logic for transient errors
- Monitor API response times and rate limits
- Log errors for debugging
