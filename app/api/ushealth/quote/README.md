# USHEALTH Quote Automation API

## Endpoint
`POST /api/ushealth/quote`

## Description
Automates the USHEALTH Group quote workflow via direct API calls, bypassing the browser UI. Uses existing auth-worker sessions for authentication.

## Prerequisites
1. Create an auth worker by uploading a HAR file from `ezapp.ushealthgroup.com` via the Auth Workers page
2. The HAR file should contain a valid session with `ASP.NET_SessionId` cookie

## Request Body
```json
{
  "zipCode": "33545",
  "state": "FL",
  "applicationTypeID": 25,
  "mktChannelID": 5,
  "appDate": "1/22/2026",
  "productSelections": {
    "ddlProduct": "123",
    "ddlCoverage": "456"
  }
}
```

### Parameters
- `zipCode` (required): ZIP code for quote
- `state` (required): Two-letter state code (e.g., "FL")
- `applicationTypeID` (optional): Defaults to 25
- `mktChannelID` (optional): Defaults to 5
- `appDate` (optional): Application date in M/D/YYYY format
- `productSelections` (optional): Form field selections for quote calculation

## Response
```json
{
  "success": true,
  "quote": {
    "products": [...],
    "coverage": {...},
    "pricing": {...},
    "validationMessages": [...],
    "message": "...",
    "updatedViewState": {...}
  },
  "steps": [
    {
      "step": "get_session",
      "success": true,
      "details": {...}
    },
    {
      "step": "get_initial_form_state",
      "success": true,
      "details": {...}
    },
    {
      "step": "fetch_product_data",
      "success": true,
      "details": {...}
    },
    {
      "step": "calculate_quote",
      "success": true,
      "details": {...}
    }
  ],
  "sessionInfo": {
    "sessionId": "...",
    "cookieCount": 2
  }
}
```

## Workflow Steps
1. **Get Session**: Retrieves auth worker session for `ushealthgroup.com`
2. **Get Initial Form State**: Fetches `/QuickQuoteMobile.aspx` and extracts `__VIEWSTATE`, `__VIEWSTATEGENERATOR`, `__EVENTVALIDATION`
3. **Fetch Product Data**: POSTs to `/ezAppMobileWebService.asmx/GetDataSetString` to get available products
4. **Calculate Quote**: POSTs to `/QuickQuoteMobile.aspx` with form data to trigger quote calculation
5. **Extract Results**: Parses HTML response to extract pricing, coverage, and validation messages

## Error Handling
- If no auth worker session exists, returns 401 with instructions to create one
- Each step logs success/failure details
- ViewState is automatically maintained between requests
- Cookies are automatically updated from Set-Cookie headers
