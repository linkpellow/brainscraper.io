---
name: Server-Side Pagination Implementation
overview: Implement production-grade server-side pagination, filtering, and sorting for the enriched leads page. Move all data processing from client to server to optimize performance and reduce memory usage.
todos:
  - id: "1"
    content: Update API route to extract pagination, filter, and sort parameters from query string
    status: pending
  - id: "2"
    content: Port getStateAbbreviation function to server-side (create utility or inline in API route)
    status: pending
  - id: "3"
    content: Implement server-side filtering function (search, age, mobile, DNC, state, date)
    status: pending
    dependencies:
      - "1"
      - "2"
  - id: "4"
    content: Implement server-side sorting function (name, city, zipcode, age, income, searchFilter)
    status: pending
    dependencies:
      - "1"
  - id: "5"
    content: Apply pagination after filtering and sorting (slice array, calculate totals)
    status: pending
    dependencies:
      - "3"
      - "4"
  - id: "6"
    content: Update API response structure to include pagination metadata and filtered stats
    status: pending
    dependencies:
      - "5"
  - id: "7"
    content: Add request validation for pagination parameters (page, limit, sortField, etc.)
    status: pending
    dependencies:
      - "1"
  - id: "8"
    content: Update frontend loadLeads function to build query parameters from filter/sort state
    status: pending
    dependencies:
      - "6"
  - id: "9"
    content: Remove getSortedLeads function and sortedLeads computed value from frontend
    status: pending
    dependencies:
      - "8"
  - id: "10"
    content: Add pagination state management (totalLeads, totalPages) to frontend
    status: pending
    dependencies:
      - "8"
  - id: "11"
    content: Add useEffect to trigger API calls when filters/sort change
    status: pending
    dependencies:
      - "8"
      - "10"
  - id: "12"
    content: Update pagination controls to use server-side pagination (page navigation triggers API calls)
    status: pending
    dependencies:
      - "10"
  - id: "13"
    content: Update handleExportCSV to fetch all filtered results for export (or create export endpoint)
    status: pending
    dependencies:
      - "9"
  - id: "14"
    content: Update localStorage handling to work with paginated data (or remove if not needed)
    status: pending
    dependencies:
      - "8"
---

# Server-Side Pagination Implementation Plan

## Problem Statement

Currently, the system loads ALL leads from `enriched-all-leads.json` into the API response, then the frontend stores all leads in React state, filters/sorts them in memory, and only displays 50 per page. This causes:

- Slow initial page loads
- High memory usage on client
- Connection timeouts with large datasets
- Poor scalability

## Solution Architecture

### Data Flow

```
Frontend Request (with filters/sort/pagination) 
  → API Route (app/api/load-enriched-results/route.ts)
  → Load JSON file
  → Apply filters (server-side)
  → Apply sorting (server-side)
  → Apply pagination (server-side)
  → Return only requested page + metadata
  → Frontend displays page
```

## Implementation Steps

### 1. Update API Route: Add Pagination Parameters

**File:** `app/api/load-enriched-results/route.ts`

- Extract query parameters:
  - `page` (default: 1)
  - `limit` (default: 50, max: 200)
  - `search` (optional: search query)
  - `ageMin`, `ageMax` (optional: age range)
  - `mobileOnly` (optional: boolean)
  - `filterDNC` (optional: boolean, exclude DNC leads)
  - `state` (optional: state abbreviation)
  - `date` (optional: date scraped filter, YYYY-MM-DD)
  - `sortField` (optional: name, city, zipcode, age, income, searchFilter, none)
  - `sortDirection` (optional: asc, desc)

- Calculate offset: `offset = (page - 1) * limit`

### 2. Implement Server-Side Filtering

**File:** `app/api/load-enriched-results/route.ts`

Create a `filterLeads` function that applies all filters:

- **Search filter**: Match name (case-insensitive)
- **Age range**: Parse `dobOrAge` and filter by numeric age
- **Mobile only**: Filter `lineType === 'mobile'`
- **DNC filter**: Exclude leads where `dncStatus === 'YES'`
- **State filter**: Normalize state to abbreviation and match
- **Date filter**: Match `dateScraped` (YYYY-MM-DD format)

**Note:** Need to port `getStateAbbreviation` function to server-side (create utility or inline).

### 3. Implement Server-Side Sorting

**File:** `app/api/load-enriched-results/route.ts`

Create a `sortLeads` function that handles:

- Sort fields: name, city, zipcode, age, income, searchFilter
- Sort direction: asc, desc
- Handle numeric vs string comparisons
- Default: no sorting (return as-is)

### 4. Apply Pagination

**File:** `app/api/load-enriched-results/route.ts`

After filtering and sorting:

- Calculate total count of filtered results
- Slice array: `filteredLeads.slice(offset, offset + limit)`
- Return paginated results

### 5. Update Response Structure

**File:** `app/api/load-enriched-results/route.ts`

Return new structure:

```typescript
{
  success: true,
  leads: LeadSummary[], // Only the requested page (50 leads)
  pagination: {
    page: number,
    limit: number,
    total: number, // Total filtered results
    totalPages: number,
  },
  stats: {
    total: number, // Total filtered results
    withPhone: number,
    withAge: number,
    withState: number,
    withZip: number,
    complete: number,
  },
  source: string,
}
```

**Note:** Stats should be calculated on filtered results, not all results.

### 6. Update Frontend: Remove Client-Side Filtering/Sorting

**File:** `app/enriched/page.tsx`

- Remove `getSortedLeads()` function (lines 628-734)
- Remove `sortedLeads` computed value
- Update `loadLeads()` to:
  - Build query parameters from current filter/sort state
  - Call API with pagination parameters
  - Store only returned leads (not all leads)
  - Store pagination metadata (total, totalPages)
  - Update `currentPage` state from API response

### 7. Update Frontend: Add Pagination State Management

**File:** `app/enriched/page.tsx`

- Add state: `const [totalLeads, setTotalLeads] = useState(0);`
- Add state: `const [totalPages, setTotalPages] = useState(1);`
- Update pagination controls to use server-side pagination:
  - Page navigation triggers new API call
  - Display total count from API
  - Update `rowsPerPage` triggers API call with new limit

### 8. Update Frontend: Filter/Sort Changes Trigger API Calls

**File:** `app/enriched/page.tsx`

- Add `useEffect` to watch filter/sort changes:
  - When `searchQuery`, `ageMin`, `ageMax`, `mobileOnly`, `filterDNC`, `selectedState`, `selectedDate`, `sortField`, `sortDirection` change
  - Reset to page 1
  - Call `loadLeads(1)` with new parameters

### 9. Update Frontend: Remove localStorage Caching of All Leads

**File:** `app/enriched/page.tsx`

- Keep localStorage for current page only (optional, for quick refresh)
- Or remove localStorage entirely since server-side is fast
- Update storage event handlers to work with paginated data

### 10. Handle State Abbreviation on Server

**File:** `app/api/load-enriched-results/route.ts`

- Port `getStateAbbreviation` function from frontend (lines 36-52 of `app/enriched/page.tsx`)
- Create utility function or inline in API route
- Use for state filtering

### 11. Update Stats Calculation

**File:** `app/api/load-enriched-results/route.ts`

- Calculate stats on filtered results (after all filters applied)
- This ensures stats reflect what user sees, not all data

### 12. Add Request Validation

**File:** `app/api/load-enriched-results/route.ts`

- Validate `page` >= 1
- Validate `limit` between 1 and 200
- Validate `sortField` is valid enum
- Validate `sortDirection` is 'asc' or 'desc'
- Return 400 error for invalid parameters

### 13. Performance Optimization: Lazy File Reading

**File:** `app/api/load-enriched-results/route.ts`

- Consider caching parsed JSON in memory (with TTL) to avoid re-parsing on every request
- Or use streaming JSON parser for very large files (future optimization)

### 14. Update Export Functionality

**File:** `app/enriched/page.tsx`

- `handleExportCSV()` currently exports `getSortedLeads()` (all filtered leads)
- Update to make API call with `limit: 10000` or similar to get all filtered results for export
- Or create separate export endpoint that returns all filtered results

## Files to Modify

1. **app/api/load-enriched-results/route.ts** - Main API route (server-side filtering, sorting, pagination)
2. **app/enriched/page.tsx** - Frontend component (remove client-side filtering/sorting, add API parameter management)

## Testing Considerations

- Test with various filter combinations
- Test pagination edge cases (first page, last page, empty results)
- Test sorting with all sort fields
- Test with large datasets (1000+ leads)
- Verify stats are accurate for filtered results
- Verify backward compatibility (no filters = returns first page)

## Migration Notes

- This is a breaking change for the API response structure
- Frontend must be updated simultaneously
- Consider feature flag for gradual rollout (if needed)
- Monitor performance improvements (initial load time, memory usage)