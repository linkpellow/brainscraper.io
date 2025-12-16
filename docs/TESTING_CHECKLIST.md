# Location Filtering - Testing Checklist

**Before deploying location filtering to production, verify all items below.**

---

## ✅ Pre-Deployment Checklist

### 1. Database Verification

- [x] All 30 states present in `data/geo-id-database.json`
- [x] Both full names and abbreviations stored for each state
- [x] All geo IDs verified against Ghost Genius tool
- [x] Database file tracked in Git
- [x] No placeholder or invalid IDs remaining

**Verification Command**:
```bash
npx tsx scripts/verify-geo-database.ts
```

**Expected Output**: `✅ Passed: 30/30 states`

---

### 2. Lookup System Testing

- [x] Full state names work (e.g., "Florida")
- [x] Abbreviations work (e.g., "FL")
- [x] Case-insensitive lookups (e.g., "FLORIDA", "florida")
- [x] Multi-word states work (e.g., "North Carolina")
- [x] Normalization converts spaces to underscores for multi-word states

**Verification Command**:
```bash
npx tsx scripts/test-location-lookup.ts
```

**Expected Output**: `✅ Passed: 21/21 lookups`

---

### 3. API Integration Testing

#### Test 1: Search with State Name

**Request**:
```json
{
  "endpoint": "search_person",
  "location": "Texas",
  "title_keywords": "Software Engineer",
  "page": 1
}
```

**Expected Behavior**:
- ✅ API route calls `lookupGeoId("Texas")`
- ✅ Returns geo ID `102748797`
- ✅ LOCATION filter includes `urn:li:fs_geo:102748797`
- ✅ Keywords also include "Texas" (fallback)
- ✅ Results returned from Texas locations

**How to Test**:
```bash
# Start dev server
npm run dev

# Use frontend UI or curl:
curl -X POST http://localhost:3000/api/linkedin-sales-navigator \
  -H "Content-Type: application/json" \
  -d '{"endpoint":"search_person","location":"Texas","title_keywords":"Software Engineer","page":1}'
```

**Check Console Logs For**:
- `📍 Location "Texas" → Geo ID: 102748797`
- `✅ Added LOCATION filter: urn:li:fs_geo:102748797`
- `📊 Final filter count: X filters`

---

#### Test 2: Search with Abbreviation

**Request**:
```json
{
  "endpoint": "search_person",
  "location": "FL",
  "title_keywords": "Marketing Manager",
  "page": 1
}
```

**Expected Behavior**:
- ✅ Lookup succeeds for abbreviation "FL"
- ✅ Returns same geo ID as "Florida": `101318387`
- ✅ Filter uses correct ID
- ✅ Results from Florida

---

#### Test 3: Multi-word State

**Request**:
```json
{
  "endpoint": "search_person",
  "location": "North Carolina",
  "title_keywords": "Sales",
  "page": 1
}
```

**Expected Behavior**:
- ✅ Normalization: "North Carolina" → "north_carolina"
- ✅ Lookup returns geo ID `103255397`
- ✅ Filter uses correct ID
- ✅ Results from North Carolina

---

#### Test 4: Unknown Location (Fallback)

**Request**:
```json
{
  "endpoint": "search_person",
  "location": "New York",  // Not in database yet
  "title_keywords": "Designer",
  "page": 1
}
```

**Expected Behavior**:
- ⚠️ Lookup returns `null` (not in database)
- ✅ API falls back to adding "New York" to keywords
- ✅ No LOCATION filter added (or empty filter)
- ✅ Search still executes (keyword-based)
- ⚠️ Results may be less accurate (relies on keywords + post-filtering)

---

### 4. Post-Filtering Verification

**Purpose**: Ensure client-side post-filtering works even if API ignores LOCATION filter

**Test**:
1. Search for location: "Texas"
2. Receive results from API
3. Frontend applies post-filtering via `utils/locationValidation.ts`
4. Only Texas results displayed to user

**Expected Behavior**:
- ✅ `validateLocationMatch(lead, "Texas")` filters out non-Texas leads
- ✅ UI shows location validation stats
- ✅ 100% of displayed results match requested location

---

### 5. End-to-End User Flow

#### Scenario A: Happy Path

1. User opens lead search page
2. Enters location: "Florida"
3. Enters title: "Engineer"
4. Clicks "Search"
5. Results displayed

**Expected**:
- ✅ All results from Florida
- ✅ All results have "Engineer" in title
- ✅ Pagination info displayed
- ✅ Location validation stats show 100% match

---

#### Scenario B: Abbreviation

1. User enters location: "TX"
2. Enters title: "Manager"
3. Clicks "Search"

**Expected**:
- ✅ System recognizes "TX" = Texas
- ✅ All results from Texas
- ✅ All results have "Manager" in title

---

#### Scenario C: Multi-word State

1. User enters location: "North Carolina"
2. Enters title: "Developer"
3. Clicks "Search"

**Expected**:
- ✅ System handles spaces correctly
- ✅ All results from North Carolina
- ✅ All results have "Developer" in title

---

### 6. Error Handling

#### Test Invalid Location

**Request**:
```json
{
  "endpoint": "search_person",
  "location": "Atlantis",  // Invalid location
  "title_keywords": "Engineer",
  "page": 1
}
```

**Expected**:
- ✅ Lookup fails gracefully
- ✅ Falls back to keywords
- ✅ Search still executes
- ✅ User sees results (may be less accurate)
- ✅ No error thrown

---

#### Test Empty Location

**Request**:
```json
{
  "endpoint": "search_person",
  "location": "",
  "title_keywords": "Engineer",
  "page": 1
}
```

**Expected**:
- ✅ No location filter applied
- ✅ Search executes with only title filter
- ✅ Results from all locations

---

### 7. Performance Testing

- [ ] Search response time < 5 seconds
- [ ] Database lookup adds < 10ms to request
- [ ] No memory leaks with repeated searches
- [ ] Concurrent requests handled correctly

**Test Command**:
```bash
# Run 10 searches in parallel
for i in {1..10}; do
  curl -X POST http://localhost:3000/api/linkedin-sales-navigator \
    -H "Content-Type: application/json" \
    -d '{"endpoint":"search_person","location":"Texas","page":1}' &
done
wait
```

---

### 8. Production Deployment Checklist

Before deploying to production:

- [ ] All tests above pass
- [ ] Database file committed to Git
- [ ] Environment variables set (RAPIDAPI_KEY)
- [ ] Error logging configured
- [ ] Rate limiting tested
- [ ] Post-filtering enabled
- [ ] Location validation stats visible in UI

---

## 🐛 Common Issues & Solutions

### Issue 1: Location not found

**Symptom**: "Location XYZ not found in database"

**Solution**:
1. Add location to database using Ghost Genius tool
2. Run `npx tsx scripts/add-state-geo-ids.ts`
3. Verify with `npx tsx scripts/verify-geo-database.ts`

---

### Issue 2: Multi-word state not working

**Symptom**: "North Carolina" returns no results

**Solution**:
- Check normalization: should convert to `north_carolina` with underscore
- Verify database has `north_carolina` key (not `north carolina`)
- Check `normalizeLocationText()` function

---

### Issue 3: Results don't match location

**Symptom**: Searching "Texas" returns results from other states

**Root Cause**: RapidAPI proxy ignores LOCATION filter

**Solution**:
- Post-filtering should catch this
- Check `utils/locationValidation.ts` is applied
- Verify location validation stats are displayed
- Ensure only filtered results shown to user

---

## 📊 Success Metrics

After deployment, monitor:

1. **Location Match Rate**: % of displayed results matching requested location (target: 100%)
2. **Geo ID Hit Rate**: % of searches where geo ID found in database (target: >90%)
3. **Search Success Rate**: % of searches returning results (target: >95%)
4. **User Satisfaction**: Feedback on result relevance (target: >90% positive)

---

**Last Updated**: 2025-11-30  
**Status**: Ready for Testing ✅

