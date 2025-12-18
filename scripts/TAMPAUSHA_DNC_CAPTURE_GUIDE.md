# TampaUSHA DNC Flow Capture Guide

## Goal

Find out how TampaUSHA uses Cognito ID tokens for DNC scrubbing so we can automate it.

## Step 1: Capture the Flow

1. Open `https://app.tampausha.com` in browser
2. Open Developer Tools (F12)
3. Go to Console tab
4. **Copy and paste** the entire content of `scripts/capture-tampausha-dnc-flow.js`
5. Press Enter
6. You should see: `✅ Capture active!`

## Step 2: Perform DNC Scrub Action

1. While the capture script is running, perform a DNC scrub action:
   - Scrub a phone number
   - Check DNC status
   - Any action that triggers DNC checking

2. The script will automatically capture all network requests

## Step 3: Analyze the Capture

1. In the same console, run:
   ```javascript
   showDncCapture()
   ```

2. Or run the analyzer:
   - Copy and paste `scripts/analyze-tampausha-dnc-capture.js`
   - Press Enter

## What to Look For

The analysis will show:
- ✅ **Which token type is used**: Cognito ID token or USHA JWT token
- ✅ **What endpoints are called**: The exact DNC scrub endpoint
- ✅ **Request format**: Headers, body, parameters
- ✅ **Token usage**: How the token is sent (Authorization header, body, etc.)

## Expected Findings

Based on your example request:
- Endpoint: `https://optic-prod-api.leadarena.com/leads/{leadId}/phones`
- Token: Cognito ID token (Bearer token)
- Headers: Includes `x-domain`, `x-user-data`, `id`

## Next Steps

Once we identify:
1. The exact endpoint format
2. How Cognito token is used
3. Request/response structure

We can implement the automation in `getUshaToken.ts`.

