#!/bin/bash
# USHA DNC Phone Scrub - Standalone Script
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
