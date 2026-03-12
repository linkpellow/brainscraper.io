# LinkedIn Sales Navigator search/scrape – configuration audit

**Date:** 2026-03-10

This doc summarizes what is configured, what depends on external factors, and what to verify so the LinkedIn Sales Navigator search/scrape is fully correct.

---

## 1. What is fully configured (in code)

### 1.1 API route (`app/api/linkedin-sales-navigator/route.ts`)

| Area | Status | Notes |
|------|--------|--------|
| **Endpoints** | OK | `premium_search_person`, `premium_search_company`, `premium_search_person_via_url`, `premium_search_company_via_url`, `json_to_url` mapped to correct RapidAPI URLs. |
| **People + location → via_url** | OK | When `requiresFilters && searchParams.location && RAPIDAPI_KEY`, the route uses the via_url path (location discovery → build URL → `premium_search_person_via_url`). No longer restricted to company-only. |
| **REGION filter for people** | OK | In the non–via_url path, when `requestBody.location` is set, a REGION filter is added for people search (location discovery or static mapping). |
| **Company headcount (self-employed)** | OK | via_url: `company_headcount_min`/`max` (including 0/0 → "A") added to `filtersForUrl` with `selectionType: 'INCLUDED'`. Regular path: same, with letter codes. Normalization forces `COMPANY_HEADCOUNT` to `INCLUDED` (never `EXCLUDED`) before URL construction / json_to_url. |
| **Pagination for via_url** | OK | When using via_url, `searchParams.page` and `searchParams.limit` are passed in the via_url request body (`viaUrlBody.page`, `viaUrlBody.limit`). Multi-page fetches re-enter the via_url block with the same params and page number. |
| **Request body for regular search** | OK | Simple params (location, title_keywords, current_company, etc.) are converted into `filters` and `keywords`. Only `allowedParams` are sent: `filters`, `keywords`, `page`, `limit`, `offset`, `sort_by`, `account_number`. `account_number` defaults to 1. |
| **Fallbacks** | OK | via_url 400/403 or URL generation failure falls back to regular search. Location discovery failure falls back to static mapping or keywords + post-filtering. |
| **Rate limits / cooldown / scrape limits** | OK | Checked before processing; 429 and account freeze handled. |

### 1.2 Frontend (`app/components/LinkedInLeadGenerator.tsx`)

| Area | Status | Notes |
|------|--------|--------|
| **Request body** | OK | For person search: `endpoint: 'premium_search_person'`, plus `...searchParams` (location, title_keywords, company_headcount_min/max, etc.). `limit` is set to 100 per page; total limit is separate. |
| **Response parsing** | OK | Multiple response shapes supported: `result.data.response.data`, `result.data.data.response.data`, `result.data.data`, `result.data`, `result.data.results`, `result.data.people`. |
| **Pagination** | OK | `fetchSinglePage(page)` sends the same search params with `page` and `limit: 100`. Backend decides via_url vs regular per request; page 2+ still get location/via_url when applicable. |
| **searchType** | OK | `person` → `premium_search_person`; `person_via_url` → `premium_search_person_via_url` (requires `url` in params). |

### 1.3 Location and filters

| Area | Status | Notes |
|------|--------|--------|
| **Location discovery** | OK | `getLocationId` (linkedinLocationDiscovery): static → cache → discover (suggestions API, HarvestAPI, saleLeads, json_to_url). Used in both via_url and regular path. |
| **Static location IDs** | OK | `linkedinLocationIds.ts`: US states + DC; no cities (e.g. Orlando). Cities rely on discovery. |
| **Filter helpers** | OK | `linkedinFilterHelpers.ts` used for company/industry/school URNs in via_url. |
| **REGION vs LOCATION** | OK | Route and URL construction use REGION with numeric ID (not LOCATION URN) for location filter. |

---

## 2. What depends on environment / external APIs

| Item | What to verify |
|------|----------------|
| **RAPIDAPI_KEY** | Set in `.env.local` (dev) and in Railway (prod). Route returns a clear error if missing. |
| **RapidAPI subscription** | realtime-linkedin-sales-navigator-data must be subscribed; quota and rate limits apply. |
| **Location discovery for "Orlando"** | Not in static list; resolved by suggestions API or HarvestAPI/saleLeads/json_to_url. If all discovery fails, the route falls back to keywords + post-filtering (or static Florida if you add it). |
| **via_url pagination** | Backend sends `page` and `limit` to `premium_search_person_via_url`. Correct behavior depends on RapidAPI actually supporting `page` on that endpoint (not always documented). If page 2+ return duplicates or errors, the API may not support page for via_url. |

---

## 3. Gaps / things to confirm with RapidAPI

1. **Exact request contract for `premium_search_person` and `premium_search_person_via_url`**  
   We rely on: `filters`, `keywords`, `page`, `limit`, `account_number` for the former, and `url`, `page`, `limit`, `account_number` for the latter. Any extra required/optional params (e.g. `sort_by`) should be checked in the RapidAPI playground or docs.

2. **Response shape**  
   The UI handles several shapes; if RapidAPI changes structure again, we may need another fallback in the frontend.

3. **`premium_search_person_via_url` and `page`**  
   If multi-page via_url searches return wrong or duplicate results, confirm with RapidAPI whether pagination is supported for the via_url endpoint and what the exact parameter names are.

---

## 4. Optional hardening

- **Orlando (or other cities) in static list**  
  If you have a known LinkedIn geo ID for Orlando, add it to `linkedinLocationIds.ts` (e.g. in a small city map or as a one-off) so you don’t depend on discovery for that query.

- **Logging when discovery fails**  
  When `getLocationId` returns `source: 'failed'` for a location, the route already falls back; ensuring this is logged (with the location string) makes it easier to see when to add static IDs or fix discovery.

---

## 5. Quick verification checklist

- [ ] `RAPIDAPI_KEY` set where the app runs (dev + prod).
- [ ] Run a people search with **location = "Orlando"** and **title keywords = "self employed"** (and optionally company headcount 0–0). Confirm results > 0 or that server logs show location discovery and via_url (or fallback) as expected.
- [ ] In browser Network tab, confirm the request to `/api/linkedin-sales-navigator` has the intended params (e.g. `location`, `company_headcount_min`/`max`, `title_keywords`). Confirm response has `data.response.data` (or one of the other parsed shapes) with an array of leads.
- [ ] If using “Fetch all pages”, run a search that can paginate and confirm page 2+ return new leads (and not duplicates) when via_url is used.

---

**Conclusion:** The LinkedIn Sales Navigator search/scrape is **fully configured in code** for the flows we use (people + location, self-employed, via_url and regular path, pagination, response parsing). Remaining uncertainties are **environment** (RAPIDAPI_KEY, subscription) and **RapidAPI behavior** (exact params and response shape, and whether via_url supports `page`). Use the verification checklist above to confirm behavior end-to-end.
