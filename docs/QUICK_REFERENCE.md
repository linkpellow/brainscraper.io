# Quick Reference - Geo ID Database

**For easy copy-paste when adding new locations**

---

## 🚀 Add Cities (Fastest Method)

1. **Find the city** on Ghost Genius:
   - Go to: https://www.ghostgenius.fr/tools/search-sales-navigator-locations-id
   - Type city name (e.g., "Phoenix")
   - Copy the ID (e.g., `101423731`)

2. **Edit the script**:
   ```bash
   code scripts/add-all-screenshot-cities.ts
   ```

3. **Add to CITIES array**:
   ```typescript
   { city: 'Phoenix', state: 'Arizona', stateAbbr: 'AZ', id: '101423731' },
   ```

4. **Run**:
   ```bash
   npx tsx scripts/add-all-screenshot-cities.ts
   ```

✅ Done! City is now in database with 3 lookup keys.

---

## 📊 Check Database Status

```bash
# Verify all states
npx tsx scripts/verify-geo-database.ts

# Test state lookups
npx tsx scripts/test-location-lookup.ts

# Test city lookups
npx tsx scripts/test-city-lookups.ts
```

---

## 🔍 Quick Lookup Test

```bash
# Start Node REPL
node

# Run this:
const { lookupGeoId } = require('./utils/geoIdDatabase.ts');
lookupGeoId('Miami, FL');
// → { locationId: '102394087', fullId: 'urn:li:fs_geo:102394087', ... }
```

---

## 📋 Current Coverage

### States: 30/30 ✅
AL, AR, CO, DE, FL, GA, IL, IN, IA, KS, KY, LA, MD, MI, MS, MO, MT, NE, NV, NC, OH, OK, SC, SD, TN, TX, UT, VA, WI, WV

### Cities: 22 ✅
- **FL**: Miami, Orlando, Tampa
- **TX**: Austin, Houston
- **TN**: Nashville, Memphis, Knoxville
- **IN**: Indianapolis, Carmel
- **CO**: Denver, Colorado Springs
- **IL**: Chicago
- **MI**: Detroit, Grand Rapids
- **OH**: Columbus, Cincinnati
- **NC**: Charlotte, Raleigh
- **MD**: Baltimore, Silver Spring
- **VA**: Virginia Beach

---

## 🎯 Common Tasks

### Add Multiple Cities at Once
Edit `scripts/add-all-screenshot-cities.ts` and paste all cities:
```typescript
const CITIES: CityEntry[] = [
  { city: 'Phoenix', state: 'Arizona', stateAbbr: 'AZ', id: '101423731' },
  { city: 'Atlanta', state: 'Georgia', stateAbbr: 'GA', id: '102571732' },
  { city: 'Seattle', state: 'Washington', stateAbbr: 'WA', id: '103447329' },
  // ... paste as many as you want
];
```

Then run once:
```bash
npx tsx scripts/add-all-screenshot-cities.ts
```

### View Database Stats
```bash
# Count entries
cat data/geo-id-database.json | grep '"id":' | wc -l

# See all cities
cat data/geo-id-database.json | grep '"city":' | sort | uniq

# See all states
cat data/geo-id-database.json | grep '"state":' | sort | uniq
```

---

## 🔧 Troubleshooting

### "Location not found"

**Problem**: Search returns no results for a location

**Solution**:
1. Check if it's in database: `cat data/geo-id-database.json | grep -i "phoenix"`
2. If not, add it using the method above
3. If yes, check normalization: `"Phoenix, AZ"` → `"phoenix_az"`

### "ID mismatch"

**Problem**: Test fails with wrong ID

**Solution**:
1. Verify ID on Ghost Genius tool
2. Re-add with correct ID
3. Run: `npx tsx scripts/add-all-screenshot-cities.ts`

### "Database corrupted"

**Problem**: Tests failing, strange errors

**Solution**:
1. Backup: `cp data/geo-id-database.json data/geo-id-database.backup.json`
2. Check JSON validity: `cat data/geo-id-database.json | jq .`
3. If broken, restore: `cp data/geo-id-database.backup.json data/geo-id-database.json`

---

## 📞 Quick Commands

```bash
# Add cities
npx tsx scripts/add-all-screenshot-cities.ts

# Verify states
npx tsx scripts/verify-geo-database.ts

# Test lookups
npx tsx scripts/test-city-lookups.ts

# View database
cat data/geo-id-database.json | jq . | less

# Count entries
cat data/geo-id-database.json | grep '"id":' | wc -l

# Search for a location
cat data/geo-id-database.json | grep -i "miami"
```

---

## 🎓 Pro Tips

1. **Batch Addition**: Open Ghost Genius tool and look up 10-20 cities at once, then add them all in one script run

2. **Verification**: Always run tests after adding cities to ensure they work

3. **Backup**: The database is in Git, so you can always revert if needed

4. **Format**: Use exact capitalization from Ghost Genius for consistency (e.g., "Virginia Beach" not "virginia beach")

5. **Abbreviations**: Always include the state abbreviation for cities (helps with disambiguation)

---

**Last Updated**: 2025-11-30  
**Database Version**: 1.0  
**Total Entries**: 171
