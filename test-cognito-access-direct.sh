#!/bin/bash

# Test Cognito Access Token directly with USHA DNC API
COGNITO_ACCESS_TOKEN="eyJraWQiOiJuM0E2aVhyWTEyTEhvUFFVYlo0XC9obFpWdkZlS3JQQmw0THV4SXRiRWYwUT0iLCJhbGciOiJSUzI1NiJ9.eyJzdWIiOiI3NDVjYTczZC0zMjRiLTQzNTAtYTBhOS1kMTUxZjExN2Y5ODIiLCJldmVudF9pZCI6ImIyZmVlM2YzLTZjZjAtNDcwOC04ZTdhLTYwMzEyNDM5MzdiNiIsInRva2VuX3VzZSI6ImFjY2VzcyIsInNjb3BlIjoiYXdzLmNvZ25pdG8uc2lnbmluLnVzZXIuYWRtaW4iLCJhdXRoX3RpbWUiOjE3NjYwODMwMzEsImlzcyI6Imh0dHBzOlwvXC9jb2duaXRvLWlkcC51cy1lYXN0LTEuYW1hem9uYXdzLmNvbVwvdXMtZWFzdC0xX1NXbUZ6dm5rdSIsImV4cCI6MTc2NjA5MDIzMSwiaWF0IjoxNzY2MDgzMDMxLCJqdGkiOiI3ODQyYWRlYS1kMDFjLTQ4NGEtYWMwOC1lMmViYTM4YjE4YzciLCJjbGllbnRfaWQiOiI1ZHJvbXNybm9waWVubXFhODNiYTRuOTI3aCIsInVzZXJuYW1lIjoiNzQ1Y2E3M2QtMzI0Yi00MzUwLWEwYTktZDE1MWYxMTdmOTgyIn0.FuT_KCEk9VUMfs42k8kqJoYlPxhl_uO04AlbDYR0lSoEaII8affdiGoukEs_-O5PBCY1-9x__wJikuhyMSh0zs1kKG6x6kilM0m-csrYFh_xw55MDs2MbvCYfnDsXaAu-ytKG9jPMnUTuw8oEYnTW4vi77pPGkYhTe-TqSgbic1lUpFiyjBD1bLTQHpx-RmFHdkLmnWPkCMUx4wmEGrjYCxlcsa5NMLyLwRAyrpLU40FqG3KPfCG0qLdAmgTHq2RdO43UuUNNs4J-mCA-tprDM_dtmuxzTIbDUrJvVvopt3Vf6IehFuNM_iWn9Qp5__cGmA4ROsd0EdB6imgyQVF3g"

echo "🧪 Testing Cognito Access Token with USHA DNC API..."
echo ""

URL="https://api-business-agent.ushadvisors.com/Leads/api/leads/scrubphonenumber?currentContextAgentNumber=00044447&phone=2694621403"

echo "Testing with Cognito Access Token..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$URL" \
  -H "Authorization: Bearer $COGNITO_ACCESS_TOKEN" \
  -H "accept: application/json, text/plain, */*" \
  -H "Referer: https://agent.ushadvisors.com/" \
  -H "Content-Type: application/json")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "Status: $HTTP_CODE"
echo "Response: $BODY" | head -c 500
echo ""

if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ SUCCESS! Cognito Access Token works directly!"
  echo "   No token exchange needed - use Access Token directly"
else
  echo "❌ Cognito Access Token does not work directly"
  echo "   Token exchange is required"
fi
