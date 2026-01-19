# ScraperAPI Skip-Tracing Optimization Plan

## Current Status

✅ **What's Working:**
- Integration with enrichment pipeline (fallback after RapidAPI)
- Multiple site support (ZabaSearch, FastPeopleSearch, SearchPeopleFree)
- Premium/Ultra Premium support for protected domains
- Capsolver integration for captcha solving
- State abbreviation mapping fixed
- URL normalization for special characters

⚠️ **What Needs Optimization:**
- Use `ultra_premium` instead of `premium` for better success rates
- Better error handling for 404s (expected when person not found)
- Rate limiting between requests
- Reduced logging in production
- Better HTML extraction patterns

## Implementation Strategy

### 1. Use Ultra Premium for Protected Domains

**Why:** ScraperAPI error message explicitly states "premium=true OR ultra_premium=true" - ultra_premium has higher success rates for protected domains.

**Implementation:**
- FastPeopleSearch: `ultra_premium=true`
- SearchPeopleFree: `ultra_premium=true`
- ZabaSearch: `premium=true` (less protected)

### 2. Graceful Error Handling

**404 Errors:** These are expected when a person doesn't exist in the database. Should:
- Log briefly (not as error)
- Continue to next site immediately
- Don't treat as failure

**500 Errors from ScraperAPI:** Usually means domain is protected and needs premium/ultra_premium. Should:
- Already handled with ultra_premium
- If still fails, try next site

### 3. Rate Limiting

**Strategy:**
- 2 second delay between different sites
- No delay for first site
- Prevents rate limiting from ScraperAPI

### 4. Production Logging

**Strategy:**
- Essential logs only (success/failure)
- Verbose logs only if `VERBOSE_SCRAPERAPI_LOGS=true` env var set
- Reduces noise in production logs

### 5. Site Priority Order

**Current Order:**
1. ZabaSearch (if state available)
2. FastPeopleSearch (always tried)
3. SearchPeopleFree (if state available)

**Optimization:** This order is good - ZabaSearch is less protected, FastPeopleSearch is most reliable, SearchPeopleFree is backup.

## Success Criteria

✅ **Seamless Operation:**
- No interruption to main pipeline
- Automatic fallback from RapidAPI
- Silent operation (minimal logs)
- Handles errors gracefully
- Returns data when available

✅ **Performance:**
- Fast failure (tries sites in parallel where possible)
- Rate limiting prevents bans
- Caches results when possible

✅ **Reliability:**
- Works with premium/ultra_premium
- Handles captchas automatically
- Falls back gracefully on errors

## Testing Checklist

- [ ] Test with US leads (all states)
- [ ] Test with international leads (should handle gracefully)
- [ ] Test with missing location data
- [ ] Test with special characters in names
- [ ] Test rate limiting (multiple requests)
- [ ] Test error scenarios (404, 500, captcha)
- [ ] Test integration with enrichment pipeline
- [ ] Verify no interruption to main pipeline

## Environment Variables

```bash
# Required
SCRAPERAPI_API_KEY=your-key
CAPSOLVER_API_KEY=your-key (optional, for captcha solving)

# Optional
VERBOSE_SCRAPERAPI_LOGS=true  # Enable verbose logging for debugging
```

## Cost Considerations

**ScraperAPI Pricing:**
- Premium: ~$0.001-0.002 per request
- Ultra Premium: ~$0.002-0.004 per request
- Render: Included in premium/ultra_premium

**Capsolver Pricing:**
- reCAPTCHA v2: ~$0.001-0.002 per solve
- Only used when captcha detected

**Optimization:**
- Only use ultra_premium for protected domains
- Use premium for less protected sites
- Capsolver only when needed (ScraperAPI premium should handle most)

## Next Steps

1. ✅ Use ultra_premium for protected domains
2. ✅ Add rate limiting
3. ✅ Improve error handling
4. ✅ Reduce logging verbosity
5. ⏳ Test with real leads
6. ⏳ Monitor success rates
7. ⏳ Optimize based on results
