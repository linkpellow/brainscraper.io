# Missing Information for DNC Scrubbing

## What We Need

To get DNC scrubbing working seamlessly, we need to identify:

### 1. **The Correct LeadArena API Endpoint for DNC Scrubbing**

**Current Status:** ❌ Unknown

**What We Know:**
- LeadArena API base: `https://optic-prod-api.leadarena.com`
- Cognito tokens work with LeadArena API ✅
- TampaUSHA uses: `/leads/{leadId}/phones` (returns phone data)
- Attempted endpoint `/leads/scrub/phone` does NOT exist (404/405)

**What We Need:**
- Exact endpoint URL for scrubbing a phone number
- Request method (GET/POST/PUT)
- Required query parameters or request body
- Required headers (besides Authorization)

### 2. **Response Format**

**Current Status:** ❌ Unknown

**What We Need:**
- Response structure (JSON format)
- Field names for DNC status (e.g., `isDNC`, `doNotCall`, `canContact`)
- Field names for DNC reason (e.g., `reason`, `dncReason`)
- Whether response is nested (e.g., `data.isDNC`) or flat

### 3. **Alternative: DNC Status in `/leads/{leadId}/phones` Response**

**Current Status:** ❓ Unknown

**Possibility:** DNC status might be included in the `/leads/{leadId}/phones` response when you GET phones for a lead.

**What We Need:**
- Confirmation if `/leads/{leadId}/phones` includes DNC status
- If yes, the field structure in that response
- How to get/create a lead ID from a phone number

## How to Capture This Information

### Step 1: Run the Capture Script

1. Open `app.tampausha.com` in your browser
2. Open browser console (F12 or Cmd+Option+I)
3. Copy and paste the entire contents of `scripts/capture-dnc-scrub-endpoint.js`
4. Press Enter

### Step 2: Perform a DNC Scrub

1. In TampaUSHA, perform a DNC scrub action:
   - Open a lead with a phone number
   - Click "Scrub Phone" or similar DNC check button
   - OR navigate to a lead's phone section
   - OR perform any action that checks DNC status

### Step 3: View Results

In the console, run:
```javascript
showDncScrubCapture()
```

This will show:
- All LeadArena API requests made
- Any requests to `/phones` or `/phone` endpoints
- Any requests containing "scrub", "dnc", or "doNotCall"
- Response structures and whether they contain DNC fields

### Step 4: Export Data

To get the full JSON data:
```javascript
exportDncScrubCapture()
```

Then copy the JSON output and share it.

## What to Look For

### Scenario A: Separate DNC Scrub Endpoint
Look for requests like:
- `GET /leads/phones/{phone}/scrub`
- `POST /leads/scrub`
- `GET /leads/scrub?phone=...`
- `GET /phones/{phone}/dnc`
- Any endpoint with "scrub", "dnc", or "doNotCall" in the URL

### Scenario B: DNC Status in Phone Data
Check the `/leads/{leadId}/phones` response for:
- Fields like `isDNC`, `doNotCall`, `canContact`, `contactStatus`
- Nested objects with DNC information
- Array items with DNC status per phone

### Scenario C: Lead Creation + Phone Check
The flow might be:
1. Create or find a lead with the phone number
2. GET `/leads/{leadId}/phones` to get phone data (with DNC status)
3. Extract DNC status from response

## Expected Output Format

Once captured, we need:

```javascript
{
  "endpoint": "https://optic-prod-api.leadarena.com/leads/...",
  "method": "GET", // or POST, PUT, etc.
  "headers": {
    "Authorization": "Bearer ...",
    "x-domain": "app.tampausha.com",
    // ... other headers
  },
  "queryParams": {
    "phone": "2143493972",
    // ... other params
  },
  // OR if POST:
  "body": {
    "phone": "2143493972",
    // ... other fields
  },
  "response": {
    "isDNC": false, // or true
    "canContact": true,
    "reason": null, // or "Federal DNC", etc.
    // ... other fields
  }
}
```

## Next Steps After Capture

Once we have this information, we will:
1. Update `callDNCAPI()` function with correct endpoint
2. Update response parsing logic
3. Re-run tests to verify seamless operation
4. Update documentation

## Quick Test

After capturing, you can test if the endpoint works by running:

```javascript
// In browser console on app.tampausha.com
const token = 'YOUR_COGNITO_TOKEN'; // Get from localStorage or capture
const phone = '2143493972';
const endpoint = 'CAPTURED_ENDPOINT_URL'; // From capture results

fetch(endpoint, {
  method: 'GET', // or POST, etc.
  headers: {
    'Authorization': `Bearer ${token}`,
    'x-domain': 'app.tampausha.com',
    // ... other headers from capture
  }
})
.then(r => r.json())
.then(data => console.log('DNC Response:', data));
```
