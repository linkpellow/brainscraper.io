#!/bin/bash
# Direct API test for LinkedIn Sales Navigator → Enrichment → DNC workflow

echo "🧪 Testing LinkedIn Lead Scraping Workflow"
echo "=========================================="
echo ""

# Check if .env.local exists
if [ ! -f .env.local ]; then
  echo "❌ .env.local not found"
  exit 1
fi

# Load environment variables
export $(grep -v '^#' .env.local | xargs)

if [ -z "$RAPIDAPI_KEY" ]; then
  echo "❌ RAPIDAPI_KEY not found in .env.local"
  exit 1
fi

echo "✅ API keys loaded"
echo ""

# Test 1: LinkedIn Sales Navigator API - Maryland, recently changed jobs
echo "📊 Step 1: Testing LinkedIn Sales Navigator API..."
echo "   Searching: People from Maryland who recently changed jobs"
echo ""

RESPONSE=$(curl -s -X POST \
  'https://realtime-linkedin-sales-navigator-data.p.rapidapi.com/premium_search_person' \
  -H "x-rapidapi-key: $RAPIDAPI_KEY" \
  -H 'x-rapidapi-host: realtime-linkedin-sales-navigator-data.p.rapidapi.com' \
  -H 'Content-Type: application/json' \
  -d '{
    "filters": [
      {
        "type": "LOCATION",
        "values": [
          {
            "id": "us:0",
            "text": "Maryland, United States",
            "selectionType": "INCLUDED"
          }
        ]
      },
      {
        "type": "CHANGED_JOBS_90_DAYS",
        "values": [
          {
            "id": "true",
            "text": "Changed jobs in last 90 days",
            "selectionType": "INCLUDED"
          }
        ]
      }
    ],
    "keywords": "",
    "limit": 5,
    "page": 1
  }')

echo "Response status:"
echo "$RESPONSE" | head -20
echo ""

# Check if response contains error
if echo "$RESPONSE" | grep -q "error\|Error\|forbidden\|Forbidden"; then
  echo "⚠️  API returned an error. Check subscription status."
else
  echo "✅ API call successful"
  
  # Try to parse and count results
  LEAD_COUNT=$(echo "$RESPONSE" | grep -o '"name"\|"full_name"\|"first_name"' | wc -l | tr -d ' ')
  echo "   Found approximately $LEAD_COUNT leads"
fi

echo ""
echo "📋 Next Steps:"
echo "1. Use the UI at http://localhost:3000/scrape"
echo "2. Search for: Location='Maryland, MD' + Changed Jobs (90 days)"
echo "3. Export results to CSV"
echo "4. Upload CSV to main page for enrichment"
echo "5. Run DNC scrubbing"

