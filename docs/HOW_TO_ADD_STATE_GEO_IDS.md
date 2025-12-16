# How to Add State Geo IDs

**Quick Guide**: Adding LinkedIn location IDs for US states to the database

---

## Step 1: Find the Geo IDs

### Method A: Ghost Genius Tool (Recommended - Fastest)

1. **Go to**: https://www.ghostgenius.fr/tools/search-sales-navigator-locations-id
2. **Enter state name**: e.g., "Alabama", "Colorado", "Texas"
3. **Copy the ID**: Just the number (e.g., `101318387`)
4. **Repeat** for each state

### Method B: LinkedIn Sales Navigator (Most Accurate)

1. **Log into** LinkedIn Sales Navigator
2. **Create a search** → Add location filter → Select the state
3. **Copy the URL** - it contains `geoUrn=urn:li:fs_geo:XXXXX`
4. **Extract the number** after `urn:li:fs_geo:`

---

## Step 2: Add IDs to the Script

Edit `scripts/add-state-geo-ids.ts`:

```typescript
const STATE_GEO_IDS: Record<string, string> = {
  'Florida': '101318387',    // ✅ Already added
  'Maryland': '103644278',   // ✅ Already verified
  'Alabama': '12345678',     // 👈 Add the ID you found
  'Colorado': '87654321',    // 👈 Add the ID you found
  // ... etc
};
```

**Just replace the empty strings `''` with the numeric IDs you found.**

---

## Step 3: Run the Script

```bash
npx tsx scripts/add-state-geo-ids.ts
```

**Output**:
```
📍 Adding State Geo IDs to Database

✅ Added: Florida (FL) = 101318387
✅ Added: Maryland (MD) = 103644278
✅ Added: Alabama (AL) = 12345678
⏭️  Skipped: Arkansas (no ID provided)

📊 Summary:
✅ Added: 3 states (6 entries with abbreviations)
⏭️  Skipped: 27 states (no ID provided)

💾 Database saved to: data/geo-id-database.json
```

---

## Step 4: Verify

The script automatically:
- ✅ Validates IDs are numeric
- ✅ Adds both state name and abbreviation entries
- ✅ Updates the database file
- ✅ Shows which states are still missing

---

## Example: Adding Multiple States

```typescript
const STATE_GEO_IDS: Record<string, string> = {
  'Florida': '101318387',
  'Maryland': '103644278',
  'Alabama': '100161977',      // Just looked up
  'Arkansas': '100039666',     // Just looked up
  'Colorado': '104508720',     // Just looked up
  'Delaware': '100381795',     // Just looked up
  'Georgia': '103130783',      // Just looked up
  // ... continue for all states
};
```

Then run:
```bash
npx tsx scripts/add-state-geo-ids.ts
```

---

## Current Status

✅ **Already in database**:
- Florida (FL) - `101318387`
- Maryland (MD) - `103644278`

⏳ **Still needed** (28 states):
- AL, AR, CO, DE, GA, IL, IN, IA, KS, KY, LA, MI, MS, MO, MT, NE, NV, NC, OH, OK, SC, SD, TN, TX, UT, VA, WI, WV

---

## Tips

1. **Batch lookup**: Open Ghost Genius tool and look up 5-10 states at a time
2. **Copy-paste**: Keep a notepad with state names and IDs as you find them
3. **Run incrementally**: You can run the script multiple times as you add more IDs
4. **Verify in app**: After adding, test searching by that state in the app

---

## What the Script Does

For each state with an ID:
1. Creates entry for state name (e.g., "Florida")
2. Creates entry for abbreviation (e.g., "FL")
3. Formats as `urn:li:fs_geo:XXXXX`
4. Adds to `data/geo-id-database.json`

**Example database entry**:
```json
{
  "florida": {
    "locationId": "101318387",
    "fullId": "urn:li:fs_geo:101318387",
    "locationName": "Florida, United States",
    "locationText": "Florida",
    "state": "Florida",
    "country": "United States",
    "source": "manual",
    "discoveredAt": "2025-01-27T...",
    "usageCount": 0
  },
  "fl": {
    "locationId": "101318387",
    "fullId": "urn:li:fs_geo:101318387",
    "locationName": "Florida, United States",
    "locationText": "FL",
    ...
  }
}
```

---

**Last Updated**: 2025-01-27

