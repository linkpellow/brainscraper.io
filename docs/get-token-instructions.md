# Exact Instructions: Get Fresh Valid Token

## ✅ After Deployment - Use These Commands

### Step 1: Get Fresh Token (No API Key Required)

```bash
curl "https://brainscraper.io/api/auth-worker/token?sessionId=har_1769140696887_api_business_agent_ushadvisors_com" | jq
```

**Expected Response:**
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

### Step 2: Extract Token and Use It

```bash
# Get token and save to variable
TOKEN=$(curl -s "https://brainscraper.io/api/auth-worker/token?sessionId=har_1769140696887_api_business_agent_ushadvisors_com" | jq -r '.token')

# Verify token was obtained
if [ "$TOKEN" = "null" ] || [ -z "$TOKEN" ]; then
  echo "❌ Failed to get token"
  exit 1
fi

echo "✅ Token obtained: ${TOKEN:0:50}..."
```

### Step 3: Use Token for DNC Scrub

#### Option A: Single Phone Scrub
```bash
curl "https://brainscraper.io/api/usha/scrub-phone?phone=2694621403&token=$TOKEN" | jq
```

#### Option B: Batch Scrub (Auto-Gets Token)
```bash
# No token needed - automatically uses auth worker
curl -X POST "https://brainscraper.io/api/usha/scrub-batch" \
  -H "Content-Type: application/json" \
  -d '{"phoneNumbers": ["2694621403", "5551234567"]}' | jq
```

## Complete One-Liner Examples

### Get Token Only
```bash
curl -s "https://brainscraper.io/api/auth-worker/token?sessionId=har_1769140696887_api_business_agent_ushadvisors_com" | jq -r '.token'
```

### Get Token and Scrub Phone
```bash
SESSION_ID="har_1769140696887_api_business_agent_ushadvisors_com"
TOKEN=$(curl -s "https://brainscraper.io/api/auth-worker/token?sessionId=$SESSION_ID" | jq -r '.token')
curl "https://brainscraper.io/api/usha/scrub-phone?phone=2694621403&token=$TOKEN" | jq
```

### Complete Workflow Script
```bash
#!/bin/bash
SESSION_ID="har_1769140696887_api_business_agent_ushadvisors_com"
BASE_URL="https://brainscraper.io"

# Get token
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

# Scrub phone
PHONE="2694621403"
echo ""
echo "📞 Scrubbing phone: $PHONE..."
SCRUB_RESPONSE=$(curl -s "$BASE_URL/api/usha/scrub-phone?phone=$PHONE&token=$TOKEN")
echo "$SCRUB_RESPONSE" | jq

# Check result
IS_DNC=$(echo "$SCRUB_RESPONSE" | jq -r '.isDNC')
if [ "$IS_DNC" = "true" ]; then
  echo "🚫 Phone is on DNC list"
else
  echo "✅ Phone is OK to contact"
fi
```

## Why You Got 401 Error (Before Fix)

The 401 error happened because:
1. **Domain mismatch**: Your session is for `api-business-agent.ushadvisors.com`
2. **Old code**: DNC endpoints only looked for `agent.ushadvisors.com` sessions
3. **Fix applied**: Now looks for ANY `ushadvisors.com` domain session

## After Deployment

Once the code is deployed, the batch endpoint will:
- ✅ Find your `api-business-agent.ushadvisors.com` session
- ✅ Get a valid token automatically
- ✅ Work without needing to pass a token

## Quick Test After Deployment

```bash
# Test 1: Token endpoint (should work without API key)
curl "https://brainscraper.io/api/auth-worker/token?sessionId=har_1769140696887_api_business_agent_ushadvisors_com" | jq '.success'

# Test 2: Batch scrub (should auto-get token)
curl -X POST "https://brainscraper.io/api/usha/scrub-batch" \
  -H "Content-Type: application/json" \
  -d '{"phoneNumbers": ["2694621403"]}' | jq '.success'
```

Both should return `true` after deployment!
