# LinkedIn Sales Navigator Location IDs Guide

## Problem
The LinkedIn Sales Navigator API requires specific location IDs in the format `urn:li:fs_geo:<LocationID>` for precise location filtering. Using generic IDs like `"us:0"` or free-form text doesn't work correctly and may return unfiltered or incorrect results.

## Solution

### 1. Location ID Lookup System
We've implemented a location ID lookup system in `utils/linkedinLocationIds.ts` that:
- Maps common US states and cities to their LinkedIn location IDs
- Automatically converts location text to proper filter format
- Falls back to keywords if location ID isn't found

### 2. How to Find Location IDs

#### Method 1: LinkedIn Location ID Finder Tool
1. Visit: https://www.ghostgenius.fr/tools/search-sales-navigator-locations-id
2. Enter your location (e.g., "Maryland", "Chevy Chase, MD")
3. Copy the location ID (numeric part, e.g., `103644278`)
4. Format: `urn:li:fs_geo:103644278`

#### Method 2: JSON to URL Mode
1. In the UI, select "JSON to URL" mode
2. Create a filter with location in Sales Navigator
3. Generate the URL
4. Extract the location ID from the URL parameters

#### Method 3: API Response
- When using location filters, check the API response
- It may return location suggestions with proper IDs

### 3. Adding New Location IDs

Edit `utils/linkedinLocationIds.ts` and add entries:

```typescript
export const US_STATE_LOCATION_IDS: Record<string, LocationMapping> = {
  'YourState': {
    name: 'YourState, United States',
    id: 'YOUR_LOCATION_ID', // Get from tool above
    fullId: 'urn:li:fs_geo:YOUR_LOCATION_ID'
  },
  // ...
};
```

### 4. Current Location IDs

**Maryland (Verified):**
- ID: `103644278`
- Format: `urn:li:fs_geo:103644278`
- Works for: "Maryland", "MD", "Chevy Chase, MD"

**Other States:**
- Need to be looked up using the tool above
- Currently using placeholders

### 5. Fallback Behavior

If a location ID isn't found:
- The system adds the location text to the `keywords` field
- This is less precise but may still help filter results
- Results may include broader geographic areas

### 6. Best Practices

1. **Use State Names**: "Maryland" works better than "MD" or "Maryland, United States"
2. **Be Specific**: Use exact state/city names as they appear in LinkedIn
3. **Test Results**: Always verify that results match your location filter
4. **Use JSON Mode**: For maximum precision, use "JSON to URL" mode with verified location IDs

## Testing

To test if a location ID works:
1. Use the location in a search
2. Check if results match the expected location
3. If results are incorrect, look up the proper location ID using the tool
4. Update `linkedinLocationIds.ts` with the correct ID

## API Format

The API expects location filters in this format:
```json
{
  "filters": [
    {
      "type": "LOCATION",
      "values": [
        {
          "id": "urn:li:fs_geo:103644278",
          "text": "Maryland, United States",
          "selectionType": "INCLUDED"
        }
      ]
    }
  ]
}
```

**Important**: The `id` field must use the full URN format (`urn:li:fs_geo:<ID>`), not just the numeric ID.

