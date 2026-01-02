#!/bin/bash

# Test all enrichment APIs with minimal calls to save money
# Usage: ./test-all-apis.sh

BASE_URL="${NEXT_PUBLIC_BASE_URL:-https://brainscraper.io}"

echo "=========================================="
echo "Testing Enrichment APIs (Minimal Calls)"
echo "=========================================="
echo ""

# Test 1: Skip-tracing API
echo "1. Testing /api/skip-tracing..."
RESPONSE=$(curl -s "${BASE_URL}/api/skip-tracing?name=John%20Smith&citystatezip=Denver,%20Colorado&page=1")
if echo "$RESPONSE" | grep -q "success\|PeopleDetails\|error"; then
  echo "   ✅ Skip-tracing API accessible"
  echo "   Response preview: $(echo "$RESPONSE" | head -c 200)..."
else
  echo "   ❌ Skip-tracing API failed or blocked"
  echo "   Response: $RESPONSE"
fi
echo ""

# Test 2: Telnyx Lookup API (requires a phone number)
echo "2. Testing /api/telnyx/lookup..."
# Use a test phone number (555-0100 is a standard test number)
RESPONSE=$(curl -s "${BASE_URL}/api/telnyx/lookup?phone=15555550100")
if echo "$RESPONSE" | grep -q "success\|portability\|carrier\|error"; then
  echo "   ✅ Telnyx API accessible"
  echo "   Response preview: $(echo "$RESPONSE" | head -c 200)..."
else
  echo "   ❌ Telnyx API failed or blocked"
  echo "   Response: $RESPONSE"
fi
echo ""

# Test 3: USHA DNC Scrub API
echo "3. Testing /api/usha/scrub-phone..."
# Use a test phone number
RESPONSE=$(curl -s "${BASE_URL}/api/usha/scrub-phone?phone=15555550100")
if echo "$RESPONSE" | grep -q "success\|isDoNotCall\|canContact\|error"; then
  echo "   ✅ USHA DNC API accessible"
  echo "   Response preview: $(echo "$RESPONSE" | head -c 200)..."
else
  echo "   ❌ USHA DNC API failed or blocked"
  echo "   Response: $RESPONSE"
fi
echo ""

# Test 4: Income by ZIP API (if used)
echo "4. Testing /api/income-by-zip..."
RESPONSE=$(curl -s "${BASE_URL}/api/income-by-zip?zipcode=80202")
if echo "$RESPONSE" | grep -q "success\|income\|error"; then
  echo "   ✅ Income API accessible"
  echo "   Response preview: $(echo "$RESPONSE" | head -c 200)..."
else
  echo "   ⚠️  Income API may not be used or failed"
  echo "   Response: $RESPONSE"
fi
echo ""

# Test 5: Website Extractor API (if used)
echo "5. Testing /api/website-extractor..."
# Use a simple test domain
RESPONSE=$(curl -s -X POST "${BASE_URL}/api/website-extractor" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}' 2>/dev/null)
if echo "$RESPONSE" | grep -q "success\|data\|error"; then
  echo "   ✅ Website Extractor API accessible"
  echo "   Response preview: $(echo "$RESPONSE" | head -c 200)..."
else
  echo "   ⚠️  Website Extractor API may not be used or failed"
  echo "   Response: $RESPONSE"
fi
echo ""

echo "=========================================="
echo "API Testing Complete"
echo "=========================================="

