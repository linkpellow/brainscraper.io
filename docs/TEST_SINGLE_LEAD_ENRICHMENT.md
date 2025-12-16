# Testing Single Lead Enrichment

## Quick Test Method (Browser UI)

Since the enrichment pipeline needs to run through Next.js API routes, the best way to test is:

### Option 1: Test with Existing Leads (Recommended)

1. **Go to the scraping page**: `http://localhost:3000/scrape`
2. **If you have leads in your list**: Click "Enrich All" - it will only enrich the leads you have
3. **Check the browser console** for the debug logs:
   - `[ENRICH_ROW] Initial data:` - Shows extracted phone/email
   - `[ENRICH_ROW] After skip-tracing:` - Shows what skip-tracing returned
   - `[ENRICH_ROW] Final result:` - Shows final enriched data
   - `[EXTRACT_SUMMARY] Missing phone/email` - Warns if data is missing

### Option 2: Add One Test Lead Manually

1. **Go to scraping page**: `http://localhost:3000/scrape`
2. **Click "View List"** to see your lead list
3. **Manually add one lead** with known email/phone:
   - Use a lead that has email/phone in the LinkedIn summary
   - Or manually add phone/email when adding to list
4. **Click "Enrich All"** - it will only enrich that one lead
5. **Check console logs** to verify data flow

### Option 3: Use "Migrate All Saved Leads" (Tests with Real Data)

1. **Go to enriched page**: `http://localhost:3000/enriched`
2. **Click "Migrate All Saved Leads (Optimized)"**
3. **This will enrich ALL saved leads** - but you can stop it after seeing the first one works
4. **Check browser console** for logs

## What to Look For

✅ **Success indicators:**
- Phone extracted from summary and preserved
- Email extracted from summary and preserved  
- ZIP code found via local lookup
- Telnyx API called (if phone found)
- Skip-tracing API called (if needed)
- Data appears in final results

❌ **Failure indicators:**
- `[EXTRACT_SUMMARY] Missing phone/email` warnings
- All fields show "N/A" after enrichment
- API errors in console

## Expected Console Output

When working correctly, you should see:

```
[ENRICH_ROW] Initial data: {
  firstName: 'John',
  lastName: 'Doe',
  city: 'Denver',
  state: 'Colorado',
  zipCode: '80201',
  phone: '1234567890',
  email: 'john@example.com'
}
[ENRICH_ROW] After skip-tracing: {
  phone: '1234567890',
  email: 'john@example.com'
}
[ENRICH_ROW] Calling Telnyx for phone: 12345...
[ENRICH_ROW] Final result: {
  hasPhone: true,
  hasEmail: true,
  hasZipCode: true,
  hasAge: true,
  hasLineType: true,
  hasCarrier: true
}
```

## If Data Still Shows N/A

1. **Check browser console** for the debug logs
2. **Check Network tab** to see if API calls are being made
3. **Verify API keys** are set in `.env.local`:
   - `RAPIDAPI_KEY`
   - `TELNYX_API_KEY`
4. **Check if APIs are returning errors** (429, 401, 403, etc.)
