# Using Brainscraper API from Another Website

## ✅ CORS Enabled - Ready for Cross-Origin Requests

The token and DNC scrub endpoints now support CORS (Cross-Origin Resource Sharing), so you can call them **directly from any website** using JavaScript `fetch()` or `curl`.

## Exact Same Code - No Additional Steps Needed!

You can use the **exact same code** from your other website. Here's how:

### From JavaScript (Browser)

```javascript
// Get token
const tokenResponse = await fetch(
  'https://brainscraper.io/api/auth-worker/token?sessionId=har_1769140696887_api_business_agent_ushadvisors_com'
);
const tokenData = await tokenResponse.json();
const token = tokenData.token;

// Scrub phone
const scrubResponse = await fetch(
  `https://brainscraper.io/api/usha/scrub-phone?phone=2694621403&token=${token}`
);
const scrubData = await scrubResponse.json();
console.log('Is DNC:', scrubData.isDNC);
```

### From Server-Side (Node.js, Python, etc.)

```bash
# Get token
TOKEN=$(curl -s "https://brainscraper.io/api/auth-worker/token?sessionId=har_1769140696887_api_business_agent_ushadvisors_com" | jq -r '.token')

# Scrub phone
curl "https://brainscraper.io/api/usha/scrub-phone?phone=2694621403&token=$TOKEN" | jq
```

## Complete Example: HTML Page

```html
<!DOCTYPE html>
<html>
<head>
  <title>DNC Scrub Test</title>
</head>
<body>
  <h1>DNC Phone Scrub</h1>
  <input type="text" id="phone" placeholder="Phone number" />
  <button onclick="scrubPhone()">Scrub Phone</button>
  <div id="result"></div>

  <script>
    async function scrubPhone() {
      const phone = document.getElementById('phone').value;
      const resultDiv = document.getElementById('result');
      
      try {
        // Step 1: Get token
        const tokenResponse = await fetch(
          'https://brainscraper.io/api/auth-worker/token?sessionId=har_1769140696887_api_business_agent_ushadvisors_com'
        );
        const tokenData = await tokenResponse.json();
        
        if (!tokenData.success || !tokenData.token) {
          throw new Error(tokenData.error || 'Failed to get token');
        }
        
        const token = tokenData.token;
        console.log('Token obtained:', token.substring(0, 50) + '...');
        
        // Step 2: Scrub phone
        const scrubResponse = await fetch(
          `https://brainscraper.io/api/usha/scrub-phone?phone=${phone}&token=${token}`
        );
        const scrubData = await scrubResponse.json();
        
        if (scrubData.isDNC) {
          resultDiv.innerHTML = `🚫 Phone ${phone} is on DNC list. Reason: ${scrubData.reason || 'Do Not Call'}`;
        } else {
          resultDiv.innerHTML = `✅ Phone ${phone} is OK to contact`;
        }
      } catch (error) {
        resultDiv.innerHTML = `❌ Error: ${error.message}`;
      }
    }
  </script>
</body>
</html>
```

## Complete Example: React Component

```jsx
import { useState } from 'react';

function DNCScrubber() {
  const [phone, setPhone] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const scrubPhone = async () => {
    setLoading(true);
    setResult(null);
    
    try {
      // Get token
      const tokenResponse = await fetch(
        'https://brainscraper.io/api/auth-worker/token?sessionId=har_1769140696887_api_business_agent_ushadvisors_com'
      );
      const tokenData = await tokenResponse.json();
      
      if (!tokenData.success || !tokenData.token) {
        throw new Error(tokenData.error || 'Failed to get token');
      }
      
      // Scrub phone
      const scrubResponse = await fetch(
        `https://brainscraper.io/api/usha/scrub-phone?phone=${phone}&token=${tokenData.token}`
      );
      const scrubData = await scrubResponse.json();
      
      setResult(scrubData);
    } catch (error) {
      setResult({ error: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <input
        type="text"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="Phone number"
      />
      <button onClick={scrubPhone} disabled={loading}>
        {loading ? 'Scrubbing...' : 'Scrub Phone'}
      </button>
      
      {result && (
        <div>
          {result.error ? (
            <p>❌ Error: {result.error}</p>
          ) : result.isDNC ? (
            <p>🚫 DNC - Reason: {result.reason}</p>
          ) : (
            <p>✅ OK to contact</p>
          )}
        </div>
      )}
    </div>
  );
}
```

## Complete Example: Python

```python
import requests
import json

def get_token():
    """Get fresh token from Brainscraper API"""
    url = "https://brainscraper.io/api/auth-worker/token"
    params = {"sessionId": "har_1769140696887_api_business_agent_ushadvisors_com"}
    response = requests.get(url, params=params)
    data = response.json()
    if data.get('success') and data.get('token'):
        return data['token']
    raise Exception(data.get('error', 'Failed to get token'))

def scrub_phone(phone, token):
    """Scrub phone number using Brainscraper API"""
    url = "https://brainscraper.io/api/usha/scrub-phone"
    params = {"phone": phone, "token": token}
    response = requests.get(url, params=params)
    return response.json()

# Usage
token = get_token()
result = scrub_phone("2694621403", token)
print(f"Is DNC: {result.get('isDNC')}")
```

## CORS Headers Added

Both endpoints now return these CORS headers:
- `Access-Control-Allow-Origin: *` (or the requesting origin)
- `Access-Control-Allow-Methods: GET, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, Authorization`
- `Access-Control-Max-Age: 86400`

## No Additional Steps Required!

✅ **No authentication needed** - Just call the endpoints  
✅ **No API keys required** - Auto-generated if missing  
✅ **No CORS issues** - Headers are set automatically  
✅ **Works from any domain** - Browser or server-side  

## Security Note

The endpoints are **publicly accessible**. If you want to restrict access:
1. Use the auto-generated `apiKey` from the token response
2. Pass it as a query parameter: `?sessionId=xxx&apiKey=xxx`
3. The endpoint will verify the API key matches the session

## Summary

**Yes, you can use the exact same code from your other website!** No additional steps needed. The endpoints now support CORS and work from any origin (browser or server-side).
