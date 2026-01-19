# ScraperAPI Skip-Tracing Integration

## Overview

Integrated ScraperAPI + Capsolver as a fallback skip-tracing solution that automatically kicks in when RapidAPI skip-tracing fails or returns no results. This provides a robust, multi-layered approach to data enrichment.

## Architecture

### Flow
1. **Primary**: RapidAPI skip-tracing (fast, structured JSON)
2. **Fallback**: ScraperAPI + HTML parsing (handles captchas, multiple sites)

### Components

#### 1. ScraperAPI Utility (`utils/scraperAPI.ts`)
- Scrapes websites using ScraperAPI
- Detects captchas automatically
- Integrates Capsolver to solve reCAPTCHA v2
- Retries after solving captcha

#### 2. HTML Extractor (`utils/htmlExtractor.ts`)
- Extracts data using JSON-LD structured data (primary method)
- Falls back to CSS selectors if JSON-LD unavailable
- Site-specific extractors for:
  - ZabaSearch
  - FastPeopleSearch
  - SearchPeopleFree
- Generic extractor for unknown sites

#### 3. Skip-Tracing Function (`utils/scraperAPISkipTracing.ts`)
- Builds search URLs for multiple people search sites
- Tries each site sequentially until results found
- Returns phone/email in standardized format

## Integration Points

### 1. `/api/enrich-single-field`
- Tries RapidAPI skip-tracing first
- Falls back to ScraperAPI if RapidAPI fails
- Returns enriched phone/email data

### 2. `/api/skip-tracing`
- GET and POST endpoints support ScraperAPI fallback
- Maintains same response format for compatibility

## Environment Variables

Required environment variables:

```bash
SCRAPERAPI_API_KEY=your-scraperapi-key
CAPSOLVER_API_KEY=your-capsolver-key
RAPIDAPI_KEY=your-rapidapi-key (existing)
```

## How It Works

### Step 1: RapidAPI Attempt
```javascript
// Tries RapidAPI with all 13 fallback keys
const rapidResult = await fetchWithRapidAPIFallback(...);
```

### Step 2: ScraperAPI Fallback (if RapidAPI fails)
```javascript
// Builds URLs for multiple sites
const urls = [
  'https://www.zabasearch.com/people/...',
  'https://www.fastpeoplesearch.com/name/...',
  'https://www.searchpeoplefree.com/find/...'
];

// Tries each site
for (const url of urls) {
  const html = await scrapeWithScraperAPI(url);
  const data = extractFromHTML(html);
  if (data.phone || data.email) return data;
}
```

### Step 3: Captcha Handling
```javascript
// If captcha detected
if (hasCaptcha(html)) {
  // Solve with Capsolver
  const token = await solveRecaptchaV2(url, siteKey);
  // Retry scraping
  const html = await scrapeWithScraperAPI(url);
}
```

## Data Extraction Methods

### 1. JSON-LD (Primary - Fastest)
```json
{
  "@type": "Person",
  "telephone": ["(269) 782-5623"],
  "email": ["linkpellow@hotmail.com"],
  "address": {
    "streetAddress": "28805 Fairlane Dr",
    "addressLocality": "Dowagiac",
    "addressRegion": "Michigan",
    "postalCode": "49047"
  },
  "birthDate": 1997
}
```

### 2. CSS Selectors (Fallback)
```javascript
$('a[href^="/phone/"]').first().text()
$('.section-box:has(h3:contains("Email")) ul li').text()
```

### 3. Regex Patterns (Last Resort)
```javascript
/\d{3}-\d{3}-\d{4}/  // Phone
/[\w.-]+@[\w.-]+\.\w+/  // Email
```

## Supported Sites

### ZabaSearch ✅
- Full JSON-LD support
- CSS selector fallbacks
- Handles blurred emails

### FastPeopleSearch
- JSON-LD extraction
- CSS selector support (needs HTML structure analysis)

### SearchPeopleFree
- JSON-LD extraction
- CSS selector support (needs HTML structure analysis)

## Response Format

```typescript
{
  phone?: string;        // 10-digit phone number
  email?: string;        // Email address
  error?: string;        // Error message if failed
  source?: string;       // 'rapidapi' | 'scraperapi-zabasearch' | etc.
  usedCapsolver?: boolean; // Whether Capsolver was used
}
```

## Error Handling

- **RapidAPI fails**: Automatically tries ScraperAPI
- **ScraperAPI fails**: Returns error with details
- **Captcha detected**: Automatically solves with Capsolver
- **No results**: Tries next site in sequence
- **All sites fail**: Returns comprehensive error

## Performance

- **RapidAPI**: ~1-2 seconds (structured JSON)
- **ScraperAPI**: ~3-5 seconds (HTML scraping)
- **With Captcha**: ~10-30 seconds (includes solving time)

## Cost Considerations

- **ScraperAPI**: Pay per request
- **Capsolver**: Pay per captcha solved
- **RapidAPI**: Existing subscription

## Logging

All operations are logged with prefixes:
- `[ScraperAPI]` - ScraperAPI operations
- `[ScraperAPI Skip-Tracing]` - Skip-tracing operations
- `[HTML Extractor]` - HTML extraction operations
- `[ENRICH_SINGLE_FIELD]` - Enrichment operations

## Future Enhancements

1. **Parallel site scraping**: Try multiple sites simultaneously
2. **Result caching**: Cache successful extractions
3. **More sites**: Add additional people search sites
4. **hCaptcha support**: Extend Capsolver to handle hCaptcha
5. **Result confidence scoring**: Rate extraction quality

## Testing

To test the integration:

```bash
# Test ScraperAPI directly
curl "https://api.scraperapi.com?api_key=YOUR_KEY&url=https://www.zabasearch.com/people/link-pellow/michigan/dowagiac/"

# Test via skip-tracing endpoint
curl -X POST http://localhost:3000/api/skip-tracing \
  -H "Content-Type: application/json" \
  -d '{"name": "Link Pellow", "citystatezip": "Dowagiac, MI"}'
```

## Troubleshooting

### ScraperAPI returns captcha
- Check Capsolver API key is set
- Verify Capsolver account has credits
- Check captcha type (currently supports reCAPTCHA v2)

### No results from any site
- Verify search URLs are correct
- Check HTML structure hasn't changed
- Review extraction logs for errors

### Slow performance
- ScraperAPI is slower than RapidAPI (expected)
- Captcha solving adds 10-30 seconds
- Consider caching successful results
