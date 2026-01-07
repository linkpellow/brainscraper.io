#!/bin/bash

# Simple skip-tracing test (no jq required)
NAME="${1:-John Smith}"
CITYSTATEZIP="${2:-}"

BASE_URL="${NEXT_PUBLIC_BASE_URL:-https://brainscraper.io}"

echo "Testing skip-tracing API..."
echo "Name: $NAME"
echo "Location: ${CITYSTATEZIP:-none}"
echo ""

# URL encode manually (simple version)
NAME_ENC=$(echo -n "$NAME" | sed 's/ /%20/g')
if [ -z "$CITYSTATEZIP" ]; then
  URL="${BASE_URL}/api/skip-tracing?name=${NAME_ENC}&page=1"
else
  CITY_ENC=$(echo -n "$CITYSTATEZIP" | sed 's/ /%20/g' | sed 's/,/%2C/g')
  URL="${BASE_URL}/api/skip-tracing?name=${NAME_ENC}&citystatezip=${CITY_ENC}&page=1"
fi

echo "URL: $URL"
echo ""
echo "Response:"
curl -s "$URL"

