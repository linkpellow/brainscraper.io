# LinkedIn Location ID Discovery System

## Overview

Production-ready solution for automatically discovering and caching LinkedIn Sales Navigator location IDs. This system eliminates the need for manual location ID lookup and ensures accurate location filtering.

## Architecture

### Multi-Strategy Fallback Chain

1. **Static Mappings** (Fastest - O(1))
   - Pre-defined location IDs in `utils/linkedinLocationIds.ts`
   - Instant lookup for common locations (Maryland, etc.)

2. **Cache Lookup** (Fast - O(1))
   - In-memory cache of previously discovered location IDs
   - Persisted to disk in `.cache/linkedin-location-ids.json`
   - 30-day TTL per entry

3. **API Discovery** (Accurate - ~1-2 seconds)
   - Uses `json_to_url` endpoint to generate Sales Navigator URL
   - Parses URL to extract location IDs
   - Automatically caches discovered IDs

4. **Keywords Fallback** (Always Works)
   - If no location ID found, adds location to keywords
   - Less precise but ensures search still works

## Components

### 1. `utils/linkedinLocationDiscovery.ts`

Core discovery service with:
- `getLocationId()` - Main entry point with multi-strategy approach
- `discoverLocationId()` - Uses json_to_url to discover IDs
- `extractLocationIdFromUrl()` - Parses Sales Navigator URLs
- `LocationIdCache` - In-memory cache with TTL

### 2. `utils/linkedinLocationCache.ts`

Persistent cache management:
- `loadCache()` - Loads cache from disk on startup
- `saveCache()` - Saves cache to disk periodically
- Auto-saves every 5 minutes and on process exit

### 3. `utils/linkedinLocationIds.ts`

Static location mappings:
- Fast lookup for known locations
- Can be manually updated with verified IDs
- Works as first-line lookup before discovery

## How It Works

### Discovery Flow

```
User enters "Maryland"
    ↓
Check static mappings → Found? Use it ✅
    ↓ (not found)
Check cache → Found? Use it ✅
    ↓ (not found)
Call json_to_url API → Get Sales Navigator URL
    ↓
Parse URL → Extract location ID
    ↓
Cache the ID → Use it ✅
    ↓ (all failed)
Fallback to keywords → Search still works ⚠️
```

### URL Parsing Strategy

The system tries multiple methods to extract location IDs from URLs:

1. **Query Parameters**: `?geo=urn:li:fs_geo:103644278`
2. **Encoded JSON**: `?filters=%5B%7B%22type%22%3A%22LOCATION%22...`
3. **Path Segments**: `/geo/103644278`
4. **Global Pattern Match**: Search entire URL for `urn:li:fs_geo:\d+`

## Usage

### Automatic (Recommended)

Just use location text in the UI - the system handles everything:

```typescript
// User enters: "Maryland"
// System automatically:
// 1. Checks static mappings
// 2. Checks cache
// 3. Discovers via API if needed
// 4. Caches for future use
// 5. Uses proper location ID in filter
```

### Manual Discovery

```typescript
import { getLocationId } from '@/utils/linkedinLocationDiscovery';

const result = await getLocationId('Maryland', RAPIDAPI_KEY);
if (result.fullId) {
  console.log(`Location ID: ${result.fullId}`);
  console.log(`Source: ${result.source}`); // 'cache' | 'discovered' | 'failed'
}
```

### Batch Discovery

```typescript
import { discoverMultipleLocations } from '@/utils/linkedinLocationDiscovery';

const locations = ['Maryland', 'California', 'New York'];
const results = await discoverMultipleLocations(locations, RAPIDAPI_KEY);

for (const [location, result] of results.entries()) {
  if (result.fullId) {
    console.log(`${location}: ${result.fullId}`);
  }
}
```

## Cache Management

### Cache Location

- **File**: `.cache/linkedin-location-ids.json`
- **Format**: JSON array of `{ location, id, fullId }`
- **TTL**: 30 days per entry
- **Auto-cleanup**: Expired entries removed automatically

### Manual Cache Operations

```typescript
import { exportCache, importCache } from '@/utils/linkedinLocationDiscovery';

// Export cache
const cacheData = exportCache();
fs.writeFileSync('backup.json', JSON.stringify(cacheData));

// Import cache
const backup = JSON.parse(fs.readFileSync('backup.json', 'utf-8'));
importCache(backup);
```

## Performance

- **Static Lookup**: < 1ms
- **Cache Lookup**: < 1ms
- **API Discovery**: 1-2 seconds (first time only)
- **Subsequent Requests**: < 1ms (from cache)

## Error Handling

The system is designed to be resilient:

- **Discovery fails**: Falls back to keywords (search still works)
- **Cache fails**: Continues without cache (discovers on-demand)
- **API fails**: Falls back to keywords (search still works)
- **No location ID**: Uses keywords (less precise but functional)

## Monitoring

The system logs discovery events:

```
📍 Discovered location ID for "Maryland": urn:li:fs_geo:103644278 (cached for future use)
📍 Using cached location ID for "Maryland": urn:li:fs_geo:103644278
⚠️  No location ID found for "Unknown Location", using keywords fallback
```

## Production Considerations

### Scaling

For high-traffic scenarios:

1. **Replace file cache with Redis/Database**
   - Update `LocationIdCache` class to use Redis
   - Or use a database table for persistence

2. **Pre-populate cache**
   - Run batch discovery for common locations
   - Store in database/cache on deployment

3. **Rate limiting**
   - Discovery API calls are rate-limited (5 per batch)
   - Cache reduces API calls significantly

### Monitoring

Track:
- Discovery success rate
- Cache hit rate
- API call frequency
- Location ID accuracy (verify results match location)

### Maintenance

- **Periodic cache refresh**: Re-discover IDs every 30 days
- **Verify IDs**: Test that cached IDs still work
- **Add static mappings**: For frequently used locations

## Testing

### Test Discovery

```bash
# Test discovery for a location
curl -X POST http://localhost:3000/api/linkedin-sales-navigator \
  -H "Content-Type: application/json" \
  -d '{
    "endpoint": "premium_search_person",
    "location": "Maryland",
    "page": 1,
    "limit": 5
  }'
```

### Verify Cache

Check `.cache/linkedin-location-ids.json` after discovery runs.

### Test URL Parsing

```typescript
import { extractLocationIdFromUrl } from '@/utils/linkedinLocationDiscovery';

const url = 'https://www.linkedin.com/sales/search/people?...';
const id = extractLocationIdFromUrl(url);
console.log(id); // Should extract location ID
```

## Future Enhancements

1. **Admin UI**: View/manage discovered location IDs
2. **Bulk Import**: Import location IDs from external sources
3. **Validation**: Verify location IDs still work before using
4. **Analytics**: Track which locations are searched most
5. **Auto-refresh**: Periodically re-discover IDs to catch changes

## Troubleshooting

### Location ID not found

1. Check cache file exists: `.cache/linkedin-location-ids.json`
2. Check API key is valid
3. Check API subscription status
4. Try manual discovery via JSON to URL mode
5. Check server logs for discovery errors

### Cache not persisting

1. Check `.cache/` directory permissions
2. Check disk space
3. Verify cache file is not in `.gitignore`
4. Check server logs for save errors

### Discovery not working

1. Verify RapidAPI key is valid
2. Check API subscription status
3. Test `json_to_url` endpoint directly
4. Check URL parsing logic matches actual URL format
5. Review server logs for API errors

