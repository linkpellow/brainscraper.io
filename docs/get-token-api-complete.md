# Get Fresh Token API - Complete Verification Guide

## ✅ Verification Complete

The token endpoint is now **fully functional** and can be called **from anywhere** to get a fresh, valid token for DNC scrubbing.

## Endpoint

```
GET https://brainscraper.io/api/auth-worker/token?sessionId=<session-id>
```

## Quick Start

### 1. Get Token (No API Key Required)

```bash
curl "https://brainscraper.io/api/auth-worker/token?sessionId=har_1769140696887_api_business_agent_ushadvisors_com"
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "tokenType": "Bearer",
  "expiresIn": 85555,
  "expiresAt": 1769370434000,
  "domain": "api-business-agent.ushadvisors.com",
  "sessionId": "har_1769140696887_api_business_agent_ushadvisors_com",
  "wasRefreshed": false,
  "apiKey": "a1b2c3d4e5f6...",
  "apiKeyGenerated": true
}
```

### 2. Use Token for DNC Scrub

```bash
# Get token
TOKEN=$(curl -s "https://brainscraper.io/api/auth-worker/token?sessionId=har_1769140696887_api_business_agent_ushadvisors_com" | jq -r '.token')

# Scrub phone number
curl "https://brainscraper.io/api/usha/scrub-phone?phone=2694621403&token=$TOKEN"
```

## Complete Workflow

### Step 1: Get Fresh Token

```bash
SESSION_ID="har_1769140696887_api_business_agent_ushadvisors_com"
RESPONSE=$(curl -s "https://brainscraper.io/api/auth-worker/token?sessionId=$SESSION_ID")
TOKEN=$(echo "$RESPONSE" | jq -r '.token')

echo "Token: $TOKEN"
```

### Step 2: Scrub Single Phone

```bash
curl "https://brainscraper.io/api/usha/scrub-phone?phone=2694621403&token=$TOKEN" | jq
```

### Step 3: Scrub Batch of Phones

```bash
curl -X POST "https://brainscraper.io/api/usha/scrub-batch" \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumbers": ["2694621403", "5551234567", "5559876543"]
  }'
```

**Note:** Batch endpoint automatically gets token from auth worker (no token parameter needed).

### Step 4: Scrub CSV File

```bash
curl -X POST "https://brainscraper.io/api/usha/scrub-csv" \
  -F "file=@leads.csv"
```

**Note:** CSV endpoint automatically gets token from auth worker (no token parameter needed).

## Features Verified

### ✅ Token Endpoint
- **Works without API key** - Auto-generates if missing
- **Auto-refreshes token** - Refreshes if expires within 30 minutes
- **Always returns valid token** - Checks expiration before returning
- **Production-ready** - All robustness improvements active

### ✅ DNC Scrub Endpoints
- **Single phone scrub** - `/api/usha/scrub-phone`
- **Batch scrub** - `/api/usha/scrub-batch`
- **CSV scrub** - `/api/usha/scrub-csv`
- **All use auth worker** - Automatically get fresh tokens
- **Auto-refresh on failure** - Retries with fresh token on 401/403

## Complete Example Script

```bash
#!/bin/bash
# Complete DNC scrubbing workflow

SESSION_ID="har_1769140696887_api_business_agent_ushadvisors_com"
BASE_URL="https://brainscraper.io"

# Step 1: Get fresh token
echo "🔑 Getting fresh token..."
TOKEN_RESPONSE=$(curl -s "$BASE_URL/api/auth-worker/token?sessionId=$SESSION_ID")
TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.token')

if [ "$TOKEN" = "null" ] || [ -z "$TOKEN" ]; then
  echo "❌ Failed to get token"
  echo "$TOKEN_RESPONSE" | jq
  exit 1
fi

echo "✅ Token obtained"
echo "   Expires in: $(echo "$TOKEN_RESPONSE" | jq -r '.expiresIn') seconds"
echo "   Was refreshed: $(echo "$TOKEN_RESPONSE" | jq -r '.wasRefreshed')"

# Step 2: Scrub phone number
PHONE="2694621403"
echo ""
echo "📞 Scrubbing phone: $PHONE..."
SCRUB_RESPONSE=$(curl -s "$BASE_URL/api/usha/scrub-phone?phone=$PHONE&token=$TOKEN")
echo "$SCRUB_RESPONSE" | jq

# Step 3: Check result
IS_DNC=$(echo "$SCRUB_RESPONSE" | jq -r '.isDNC')
if [ "$IS_DNC" = "true" ]; then
  echo "🚫 Phone is on DNC list"
else
  echo "✅ Phone is OK to contact"
fi
```

## Integration Examples

### Python

```python
import requests
import json

def get_fresh_token(session_id):
    """Get fresh token from auth worker"""
    url = f"https://brainscraper.io/api/auth-worker/token"
    params = {"sessionId": session_id}
    response = requests.get(url, params=params)
    data = response.json()
    return data["token"]

def scrub_phone(phone, token):
    """Scrub single phone number"""
    url = "https://brainscraper.io/api/usha/scrub-phone"
    params = {"phone": phone, "token": token}
    response = requests.get(url, params=params)
    return response.json()

# Usage
token = get_fresh_token("har_1769140696887_api_business_agent_ushadvisors_com")
result = scrub_phone("2694621403", token)
print(f"Is DNC: {result['isDNC']}")
```

### JavaScript/TypeScript

```typescript
async function getFreshToken(sessionId: string): Promise<string> {
  const response = await fetch(
    `https://brainscraper.io/api/auth-worker/token?sessionId=${sessionId}`
  );
  const data = await response.json();
  if (!data.success || !data.token) {
    throw new Error(data.error || 'Failed to get token');
  }
  return data.token;
}

async function scrubPhone(phone: string, token: string) {
  const response = await fetch(
    `https://brainscraper.io/api/usha/scrub-phone?phone=${phone}&token=${token}`
  );
  return await response.json();
}

// Usage
const token = await getFreshToken('har_1769140696887_api_business_agent_ushadvisors_com');
const result = await scrubPhone('2694621403', token);
console.log('Is DNC:', result.isDNC);
```

## Verification Checklist

- [x] Token endpoint works without API key
- [x] Token endpoint auto-generates API key if missing
- [x] Token endpoint auto-refreshes token if needed
- [x] DNC scrub endpoints use auth worker tokens
- [x] DNC scrub endpoints work without API key requirement
- [x] All endpoints are production-ready
- [x] Complete workflow tested end-to-end

## Summary

✅ **You can call the API endpoint from anywhere**  
✅ **No API key required** (auto-generated if missing)  
✅ **Token is automatically refreshed** (within 30 minutes of expiration)  
✅ **Works with all DNC scrub endpoints**  
✅ **Production-ready** with all robustness improvements  

The complete flow is verified and ready to use!
