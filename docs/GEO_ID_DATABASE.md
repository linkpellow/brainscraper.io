# Geo ID Database System

**Date**: 2025-01-27  
**Status**: ✅ Implemented - Auto-building location ID database

---

## Overview

Since the LinkedIn Sales Navigator API ignores LOCATION filters, we've built a comprehensive system to:
1. **Discover** location IDs from multiple API sources
2. **Cache** discovered IDs in a persistent database
3. **Auto-expand** the database as we encounter new locations
4. **Fast lookup** for instant location ID retrieval

---

## How It Works

### 1. Database Structure

**File**: `data/geo-id-database.json`

```json
{
  "version": "1.0.0",
  "lastUpdated": "2025-01-27T12:00:00Z",
  "entries": {
    "maryland": {
      "locationId": "103644278",
      "fullId": "urn:li:fs_geo:103644278",
      "locationName": "Maryland, United States",
      "locationText": "Maryland",
      "state": "Maryland",
      "country": "United States",
      "source": "json_to_url",
      "discoveredAt": "2025-01-27T12:00:00Z",
      "usageCount": 15
    }
  }
}
```

### 2. Discovery Sources

The system tries multiple APIs in parallel to discover location IDs:

#### A. **Profile Extraction** (Fastest)
- Extracts geo IDs from lead profiles in API responses
- Source: Any API that returns profile data with location info
- Auto-caches as we search
- **Priority**: Highest (happens automatically)

#### B. **HarvestAPI**
- Fresh LinkedIn Profile Data API
- Searches for profiles in the location
- Extracts geo IDs from results
- **Endpoint**: `fresh-linkedin-profile-data.p.rapidapi.com/search-results`

#### C. **saleLeads.ai**
- Alternative LinkedIn data API
- Searches by location
- Extracts geo IDs from responses
- **Endpoint**: `saleleads-ai.p.rapidapi.com/search/people`

#### D. **json_to_url**
- Sales Navigator URL generator
- Generates URLs with location filters
- Extracts IDs from generated URLs
- **Endpoint**: `realtime-linkedin-sales-navigator-data.p.rapidapi.com/json_to_url`

### 3. Auto-Discovery Workflow

```
User searches for "California"
    ↓
Check database for "California"
    ↓
Not found? → Discover in parallel:
    ├─ HarvestAPI search
    ├─ saleLeads.ai search
    └─ json_to_url generation
    ↓
First successful result saved to database
    ↓
Future searches instant (cached)
```

### 4. Auto-Extraction from Results

Every time we get leads from the API:
```typescript
// Automatically extract and cache geo IDs
const leads = result.response.data;
extractAndCacheGeoIds(leads);

// Example: If a lead has:
// geoRegion: "Seattle, Washington, United States"
// geoUrn: "urn:li:fs_geo:12345"
// → Auto-cached for future "Seattle" searches
```

---

## Usage

### Automatic Usage (Already Integrated)

The system works automatically in the background:

```typescript
// When a user searches:
const result = await fetch('/api/linkedin-sales-navigator', {
  method: 'POST',
  body: JSON.stringify({
    location: 'California',
    title_keywords: 'Director'
  })
});

// System automatically:
// 1. Checks database for "California" ID
// 2. If not found, discovers it via multiple APIs
// 3. Caches for future use
// 4. Extracts IDs from returned leads
```

### Manual Database Building

Build the database with all US states and major cities:

```bash
# Run the database builder
npx tsx scripts/build-geo-id-database.ts

# This will:
# - Discover IDs for all 50 US states
# - Discover IDs for 28 major cities  
# - Take ~10-15 minutes (rate limiting)
# - Save to data/geo-id-database.json
# - Export CSV to data/geo-id-database.csv
```

### Programmatic Usage

```typescript
import { getLocationIdWithCache } from '@/utils/enhancedLocationDiscovery';

// Get location ID (auto-discovers if needed)
const result = await getLocationIdWithCache('Maryland', RAPIDAPI_KEY, true);

if (result) {
  console.log(`ID: ${result.locationId}`);
  console.log(`Full URN: ${result.fullId}`);
  console.log(`Name: ${result.locationName}`);
  console.log(`Source: ${result.source}`); // 'database' or 'discovery'
  console.log(`Cached: ${result.cached}`); // true if from database
}
```

### Extract from Leads

```typescript
import { extractAndCacheGeoIds } from '@/utils/enhancedLocationDiscovery';

// After getting leads from API
const leads = result.response.data;
const extracted = extractAndCacheGeoIds(leads);
console.log(`Extracted ${extracted} new location IDs`);
```

### Database Stats

```typescript
import { getGeoIdDatabaseStats } from '@/utils/geoIdDatabase';

const stats = getGeoIdDatabaseStats();
console.log(`Total entries: ${stats.totalEntries}`);
console.log(`By source:`, stats.bySource);
console.log(`By country:`, stats.byCountry);
console.log(`Most used:`, stats.mostUsed);
```

---

## Benefits

### 1. **Self-Improving System** 🔄
- Starts small, grows automatically
- Every search adds new location IDs
- Database becomes more comprehensive over time

### 2. **Fast Lookups** ⚡
- Instant retrieval from database (no API calls)
- Only discovers once per location
- Reduces API usage and latency

### 3. **Multi-Source Reliability** 🎯
- Tries multiple APIs in parallel
- Falls back if one source fails
- Increases discovery success rate

### 4. **Usage Tracking** 📊
- Tracks how often each location is used
- Helps identify popular locations
- Useful for optimization

### 5. **Exportable** 📤
- Export to CSV for analysis
- Share database across systems
- Backup and restore easily

---

## File Structure

```
/data/
  ├── .gitkeep
  ├── geo-id-database.json    # Main database (tracked in git)
  └── geo-id-database.csv     # Export (ignored in git)

/utils/
  ├── geoIdDatabase.ts        # Database operations
  ├── geoIdDiscoveryService.ts # Multi-API discovery
  └── enhancedLocationDiscovery.ts # Main API

/scripts/
  └── build-geo-id-database.ts # Pre-populate script
```

---

## API Integration

### Updated API Route

The API route now:
1. Checks database for location ID
2. Auto-discovers if not found
3. Extracts IDs from response leads
4. Caches for future use

```typescript
// app/api/linkedin-sales-navigator/route.ts
import { getLocationIdWithCache, extractAndCacheGeoIds } from '@/utils/enhancedLocationDiscovery';

// Get location ID
const locationResult = await getLocationIdWithCache(
  requestBody.location,
  RAPIDAPI_KEY,
  true // auto-discover
);

// After getting results
const leads = data.response.data;
extractAndCacheGeoIds(leads); // Auto-cache for future
```

---

## Database Growth Example

**Initial**: Empty database
```json
{
  "version": "1.0.0",
  "entries": {}
}
```

**After 1 search** (Maryland):
```json
{
  "entries": {
    "maryland": { ... }
  }
}
```

**After 10 searches** (Different states):
```json
{
  "entries": {
    "maryland": { ... },
    "california": { ... },
    "new york": { ... },
    "texas": { ... },
    ...
  }
}
```

**After 100 searches** (Cities + extraction):
```json
{
  "entries": {
    // 50 US states
    // 50+ major cities
    // 100+ smaller cities (from lead extraction)
  }
}
```

---

## Performance

- **First lookup**: ~2-3 seconds (discovery via multiple APIs)
- **Subsequent lookups**: <1ms (database lookup)
- **Memory usage**: Minimal (~1-2MB for 1000 locations)
- **Disk usage**: ~500KB JSON file for 1000 locations

---

## Next Steps

1. ✅ **System Implemented** - Auto-discovery and caching working
2. ⏳ **Pre-populate** - Run `build-geo-id-database.ts` to seed common locations
3. ⏳ **Monitor Growth** - Track database growth over time
4. ⏳ **Share Database** - Export and share with other instances
5. ⏳ **Analytics** - Analyze popular locations and usage patterns

---

## Troubleshooting

### Database Not Growing?
- Check API key is valid
- Verify auto-discovery is enabled
- Check console for discovery errors

### Slow Discovery?
- Normal for first lookup (2-3 seconds)
- Pre-populate database to avoid delays
- Run batch discovery during off-hours

### Missing Locations?
- Some obscure locations may not be discoverable
- Falls back to keywords automatically
- Post-filtering ensures accuracy

---

**Last Updated**: 2025-01-27

