#!/bin/bash

# Test skip-tracing API with name parameter
# Usage: ./test-skip-tracing.sh "John Doe" "Denver, Colorado"

NAME="${1:-John Smith}"
CITYSTATEZIP="${2:-}"

BASE_URL="${NEXT_PUBLIC_BASE_URL:-http://localhost:3000}"

echo "Testing skip-tracing API..."
echo "Name: $NAME"
echo "Location: ${CITYSTATEZIP:-none}"
echo ""

if [ -z "$CITYSTATEZIP" ]; then
  URL="${BASE_URL}/api/skip-tracing?name=$(echo -n "$NAME" | jq -sRr @uri)&page=1"
else
  URL="${BASE_URL}/api/skip-tracing?name=$(echo -n "$NAME" | jq -sRr @uri)&citystatezip=$(echo -n "$CITYSTATEZIP" | jq -sRr @uri)&page=1"
fi

echo "URL: $URL"
echo ""
echo "Response:"
curl -s "$URL" | jq '.' || curl -s "$URL"

