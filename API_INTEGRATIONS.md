# API Integrations Summary

Complete overview of all integrated APIs in brainscraper.io

## 📋 Table of Contents
- [Skip Tracing APIs](#skip-tracing-apis)
- [LinkedIn APIs](#linkedin-apis)
- [Website & Domain APIs](#website--domain-apis)
- [Facebook APIs](#facebook-apis)
- [Phone Number APIs](#phone-number-apis)
- [Income & Demographic APIs](#income--demographic-apis)
- [USHA DNC Scrubbing](#usha-dnc-scrubbing)

---

## Skip Tracing APIs

### 1. Skip Tracing API (v1) ✅
**Route:** `/api/skip-tracing`  
**RapidAPI:** `skip-tracing-working-api`  
**Endpoint:** `search/byemail`  
**Method:** GET  
**Input:** Email and/or phone number  
**Status:** ✅ Integrated & Active  
**Auto-Enrichment:** Yes (Phase 1 - Foundation Data)

### 2. Skip Tracing API (v2) ✅
**Route:** `/api/skip-tracing-v2`  
**RapidAPI:** `skip-tracing-api`  
**Endpoints:**
- `owners-by-address` (POST) - Search property owners by address
- `by-name-and-address` (POST) - Search person by name and address
- `person/:tahoeId` (GET) - Get person info by ID

**Status:** ✅ Integrated & Active  
**Auto-Enrichment:** Yes (Phase 2 - Address-Based Enrichment)

---

## LinkedIn APIs

### 3. LinkedIn Data API ✅
**Route:** `/api/linkedin-profile`  
**RapidAPI:** `li-data-scraper`  
**Endpoint:** `get-profile-data-by-url`  
**Method:** GET  
**Input:** LinkedIn profile URL  
**Status:** ✅ Integrated & Active  
**Auto-Enrichment:** Yes (Phase 4 - Social Profiles)

### 4. LinkedIn Company Data API ✅
**Route:** `/api/linkedin-company`  
**RapidAPI:** `linkedin-data-api`  
**Endpoint:** `get-company-by-domain`  
**Method:** GET  
**Input:** Domain name  
**Status:** ✅ Integrated (Service may be discontinued)  
**Auto-Enrichment:** Yes (Phase 3 - Domain/Company Enrichment)

### 5. LinkedIn Bulk Data Scraper ✅
**Route:** `/api/linkedin-scraper`  
**RapidAPI:** `linkedin-bulk-data-scraper`  
**Endpoints:**
- `/profile` (POST) - Scrape profile data
- `/goat` (GET) - Test endpoint

**Status:** ✅ Integrated (Service may be discontinued)  
**Auto-Enrichment:** No (Available as manual API route)

### 6. Fresh LinkedIn Profile Data - Enrich Lead ✅
**Route:** `/api/fresh-linkedin-profile`  
**RapidAPI:** `fresh-linkedin-profile-data`  
**Endpoint:** `enrich-lead`  
**Method:** GET  
**Input:** LinkedIn profile URL  
**Optional Parameters:**
- `include_skills`
- `include_certifications`
- `include_publications`
- `include_honors`
- `include_volunteers`
- `include_projects`
- `include_patents`
- `include_courses`
- `include_organizations`
- `include_profile_status`
- `include_company_public_url`

**Status:** ✅ Integrated (Requires RapidAPI subscription)  
**Auto-Enrichment:** Yes (Phase 4 - Social Profiles)

### 7. Fresh LinkedIn Company Data ✅
**Route:** `/api/fresh-linkedin-company`  
**RapidAPI:** `fresh-linkedin-profile-data`  
**Endpoint:** `get-company-by-linkedinurl`  
**Method:** GET  
**Input:** LinkedIn company URL (`linkedin.com/company/...`)  
**Status:** ✅ Integrated (Requires RapidAPI subscription)  
**Auto-Enrichment:** Yes (Phase 3 - Domain/Company Enrichment)

### 8. Fresh LinkedIn Employee Search ✅
**Route:** `/api/fresh-linkedin/search-employees`  
**RapidAPI:** `fresh-linkedin-profile-data`  
**Endpoint:** `big-search-employee`  
**Method:** POST  
**Input:**
- `current_company_ids` (array)
- `title_keywords` (array)

**Status:** ✅ Integrated (Requires RapidAPI subscription)  
**Auto-Enrichment:** No (Search endpoint - returns request_id)

### 9. Fresh LinkedIn Search Results ✅
**Route:** `/api/fresh-linkedin/search-results`  
**RapidAPI:** `fresh-linkedin-profile-data`  
**Endpoint:** `get-search-results`  
**Method:** GET  
**Input:**
- `request_id` (from employee search)
- `page` (pagination)

**Status:** ✅ Integrated (Requires RapidAPI subscription)  
**Auto-Enrichment:** No (Retrieves search results)

---

## Website & Domain APIs

### 10. Website Contacts Scraper ✅
**Route:** `/api/website-contacts`  
**RapidAPI:** `website-contacts-scraper`  
**Endpoint:** `scrape-contacts`  
**Method:** GET  
**Input:** Domain/website URL  
**Parameters:**
- `query` - Domain name
- `match_email_domain` - Boolean
- `external_matching` - Boolean

**Status:** ✅ Integrated (Requires RapidAPI subscription)  
**Auto-Enrichment:** Yes (Phase 3 - Domain/Company Enrichment)

### 11. Website Emails & Social Media Link Extractor ✅
**Route:** `/api/website-extractor`  
**RapidAPI:** `website-emails-social-media-pages-link-extractor`  
**Endpoint:** `extract`  
**Method:** GET  
**Input:** Website URL  
**Status:** ✅ Integrated (Requires RapidAPI subscription)  
**Auto-Enrichment:** Yes (Phase 3 - Domain/Company Enrichment)

---

## Facebook APIs

### 12. Facebook Profile Photos Scraper ✅
**Route:** `/api/facebook-profile`  
**RapidAPI:** `facebook-scraper3`  
**Endpoint:** `profile/photos`  
**Method:** GET  
**Input:** Facebook profile ID  
**Status:** ✅ Integrated (Requires RapidAPI subscription)  
**Auto-Enrichment:** Yes (Phase 4 - Social Profiles)

---

## Phone Number APIs

### 13. Telnyx Number Lookup ✅
**Route:** `/api/telnyx/lookup`  
**API:** Telnyx (Direct API, not RapidAPI)  
**Endpoint:** `v2/number_lookup`  
**Method:** GET  
**Input:** Phone number (E.164 format)  
**Returns:**
- Carrier information
- Caller ID name (CNAM)
- Line type (mobile/landline/VoIP)
- Location data

**Status:** ✅ Integrated (Requires Telnyx API key)  
**Auto-Enrichment:** Yes (Phase 1 - Foundation Data, runs first)

**Environment Variable:** `TELNYX_API_KEY`

---

## Income & Demographic APIs

### 14. Household Income by Zip Code ✅
**Route:** `/api/income-by-zip`  
**RapidAPI:** `household-income-by-zip-code`  
**Endpoint:** `v1/Census/HouseholdIncomeByZip/{zipCode}`  
**Method:** GET  
**Input:** 5-digit zip code  
**Returns:** Median household income  
**Status:** ✅ Integrated & Active  
**Auto-Enrichment:** Yes (Phase 1 - Foundation Data)

---

## USHA DNC Scrubbing

### 15. USHA Bulk Lead Scrubbing ✅
**Routes:**
- `/api/usha/scrub` - Upload CSV and trigger DNC scrubbing
- `/api/usha/import-jobs` - List all import jobs
- `/api/usha/import-log` - Get detailed scrub results by JobLogID

**API:** USHA Business Agent API (Direct API, not RapidAPI)  
**Endpoint:** `Leads/api/leads/importafterMapping`  
**Method:** POST (multipart/form-data)  
**Input:** CSV file with lead data  
**Returns:** JobLogID for tracking  
**Status:** ✅ Integrated (Requires USHA JWT token)  
**Auto-Enrichment:** No (Manual trigger via UI)

**Environment Variable:** `USHA_JWT_TOKEN`

**CSV Format Required:**
- First Name, Last Name, City, State, Zip, Date Of Birth, House hold Income, Primary Phone

---

## Enrichment Flow Order

The system enriches data in the following optimal sequence:

### Phase 1: Foundation Data (Fast, Independent)
1. **Telnyx Phone Lookup** - Carrier, caller name, line type
2. **Income Data** - Zip code → median income
3. **Skip-Tracing v1** - Email/phone → contact data

### Phase 2: Address-Based Enrichment
4. **Skip-Tracing v2 (Address)** - Property owners by address
5. **Skip-Tracing v2 (Name + Address)** - Person verification

### Phase 3: Domain/Company Enrichment
6. **Website Extractor** - Extract emails & social links
7. **Website Contacts** - Contact discovery
8. **Company Data** - LinkedIn company by domain
9. **Fresh LinkedIn Company** - Company data by LinkedIn URL

### Phase 4: Social Profiles
10. **LinkedIn Profile** - Profile data by URL
11. **Fresh LinkedIn Profile** - Detailed profile enrichment
12. **Facebook Profile** - Profile photos by ID

---

## Environment Variables

Required in `.env.local`:

```bash
# RapidAPI (used by most APIs)
RAPIDAPI_KEY=your-rapidapi-key-here

# Telnyx Phone Lookup
TELNYX_API_KEY=your-telnyx-api-key-here

# USHA DNC Scrubbing
USHA_JWT_TOKEN=your-usha-jwt-token-here
```

---

## API Status Summary

| API | Status | Auto-Enrich | Subscription Required |
|-----|--------|-------------|----------------------|
| Skip Tracing v1 | ✅ Active | Yes | No |
| Skip Tracing v2 | ✅ Active | Yes | No |
| Telnyx Lookup | ✅ Active | Yes | Yes (Telnyx) |
| Income by Zip | ✅ Active | Yes | No |
| LinkedIn Profile | ⚠️ May be discontinued | Yes | Yes |
| LinkedIn Company | ⚠️ May be discontinued | Yes | Yes |
| Fresh LinkedIn Profile | ✅ Ready | Yes | Yes |
| Fresh LinkedIn Company | ✅ Ready | Yes | Yes |
| Website Contacts | ✅ Ready | Yes | Yes |
| Website Extractor | ✅ Ready | Yes | Yes |
| Facebook Photos | ✅ Ready | Yes | Yes |
| USHA DNC Scrub | ✅ Ready | No (Manual) | Yes (USHA) |

---

## Notes

- **RapidAPI Subscriptions:** Many APIs require active RapidAPI subscriptions. The code is ready, but you'll need to subscribe to each API on RapidAPI.
- **Service Discontinuation:** Some LinkedIn APIs may have been discontinued by their providers. The integration remains in place.
- **Auto-Enrichment:** APIs marked with "Auto-Enrichment: Yes" automatically run when relevant data is detected in uploaded spreadsheets.
- **Manual APIs:** Some endpoints (like search APIs) are available but require manual API calls rather than automatic enrichment.

---

## Testing

To test any API endpoint:

```bash
# Example: Test Telnyx lookup
curl "http://localhost:3000/api/telnyx/lookup?phone=2694621403"

# Example: Test Fresh LinkedIn profile
curl "http://localhost:3000/api/fresh-linkedin-profile?linkedin_url=https://www.linkedin.com/in/cjfollini/"
```

---

Last Updated: Current as of latest integration

