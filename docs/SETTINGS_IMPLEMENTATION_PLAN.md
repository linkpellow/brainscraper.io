# Settings Implementation Plan - Comprehensive Strategy

**Status**: 📋 Planning Phase  
**Date**: 2025-01-XX  
**Objective**: Add advanced settings page with scrape controls, API toggles, scheduling, and cost management

---

## Executive Summary

This plan outlines a **non-breaking, additive approach** to implementing advanced settings features. The strategy leverages existing patterns (file-based storage, Inngest background jobs, enrichment pipeline) while introducing new configuration layers that integrate seamlessly without disrupting current functionality.

**Core Principle**: All new features are **opt-in** and **backward compatible**. Existing workflows continue to work unchanged if settings are not configured.

---

## Efficiency & Intelligence Analysis

### ✅ Why This Approach is Efficient

1. **Reuses Existing Patterns**
   - File-based storage (proven with jobStatus, enriched leads)
   - File locking (already implemented in fileLock.ts)
   - No new infrastructure needed

2. **Minimal Code Changes**
   - Wrapper pattern (wrap existing functions, don't rewrite)
   - Single integration point (`callAPI()` wrapper)
   - Guards at API route level (early returns, no deep changes)

3. **Performance Optimized**
   - Settings cached in memory (load once per request)
   - Usage tracking batched (not per-API-call)
   - Toggle checks are simple boolean (nanosecond overhead)

4. **Scalable Architecture**
   - Single settings file (small, fast reads)
   - Profile system (extensible, doesn't bloat core)
   - Modular design (can disable features independently)

### ✅ Why This Approach is Intelligent

1. **Non-Breaking by Design**
   - Default settings = current behavior
   - Missing settings file = defaults applied
   - Disabled features = graceful skip (not error)

2. **Layered Integration**
   - Settings layer (storage)
   - Middleware layer (enforcement)
   - Existing layer (unchanged)
   - Clear separation of concerns

3. **Cost Control Without Risk**
   - API toggles skip calls (return null)
   - Pipeline continues (no crashes)
   - Cost calculator shows impact before enabling

4. **Smart Scheduling**
   - Builds on Inngest (doesn't replace)
   - Conditional rules (flexible logic)
   - Load balancing (spread workload)

### ⚠️ Potential Concerns & Mitigations

**Concern 1**: Settings file could become bottleneck  
**Mitigation**: 
- Single file is small (<10KB)
- Cached in memory per request
- File locking prevents corruption
- Read operations are fast (JSON.parse)

**Concern 2**: API toggle checks add overhead  
**Mitigation**:
- Simple boolean check (negligible)
- Cached settings (no file read per call)
- Only checked once per enrichment batch

**Concern 3**: Usage tracking could slow scraping  
**Mitigation**:
- Batched writes (update every N operations)
- Async writes (don't block scraping)
- File locking prevents conflicts

**Concern 4**: Complex scheduling logic  
**Mitigation**:
- Optional feature (disabled by default)
- Simple rules first (business hours, weekends)
- Complex rules can be added incrementally

---

## Recommended Implementation Order

### Phase 1: Foundation (Low Risk, High Value)
1. Settings storage system
2. Settings API routes
3. Basic settings page UI
4. **Deploy**: Safe, no integration yet

### Phase 2: API Controls (High Value, Low Risk)
1. API registry
2. Toggle middleware
3. Cost calculator
4. **Deploy**: Wrapper pattern, non-breaking

### Phase 3: Scrape Controls (Medium Risk, High Value)
1. Usage tracking
2. Limit enforcement
3. Rate throttling
4. **Deploy**: Guards only, existing code unchanged

### Phase 4: Advanced Features (Medium Risk, Incremental Value)
1. Profiles
2. Scheduling
3. Output routing
4. Notifications
5. **Deploy**: One feature at a time

---

## Alternative Approaches Considered

### ❌ Database Approach
**Why Not**: 
- Adds complexity (new dependency)
- Overkill for single-user settings
- File-based is simpler and sufficient

### ❌ Environment Variables
**Why Not**:
- Not user-editable
- Requires deployment to change
- Can't have multiple profiles

### ❌ Separate Config Service
**Why Not**:
- Unnecessary complexity
- File-based is sufficient
- Adds latency

### ✅ File-Based (Chosen)
**Why Yes**:
- Matches existing patterns
- Simple and fast
- User-editable via UI
- No new dependencies

---

---

## Current System Analysis

### ✅ Existing Patterns (Confirmed)

1. **File-Based Storage**
   - Pattern: `data/jobs/*.json` for job status
   - Pattern: `data/enriched-leads/*.json` for leads
   - Pattern: `data/api-results/*.json` for scraped results
   - **Reuse**: Settings will use `data/settings.json` (single file, locked writes)

2. **Configuration Management**
   - Currently: Environment variables only (`RAPIDAPI_KEY`, `TELNYX_API_KEY`, `USHA_JWT_TOKEN`)
   - No runtime configuration system
   - **Gap**: Need persistent, user-editable config

3. **Enrichment Pipeline**
   - Location: `utils/enrichData.ts`
   - Function: `enrichRow()` - processes one lead
   - Function: `enrichData()` - processes batch
   - API calls: Direct `callAPI()` function calls
   - **Integration Point**: Wrap `callAPI()` with config checks

4. **Background Jobs**
   - System: Inngest
   - Functions: `enrichment.ts`, `scraping.ts`
   - Retries: Built-in (2-3 retries)
   - **Integration Point**: Add scheduling layer on top

5. **Error Handling**
   - Pattern: `callAPI()` with retry logic
   - Rate limiting: 429 detection exists
   - **Enhancement**: Add cooldown windows, error spike detection

6. **Navigation Structure**
   - Sidebar: Lead Generation, Enrichment Queue, Enriched Leads
   - **Addition**: Settings page (new route)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Settings Page                         │
│  (New Route: /settings)                                 │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│           Configuration Storage Layer                    │
│  utils/settingsConfig.ts                                │
│  - Load/Save settings                                   │
│  - File locking (reuse fileLock.ts)                     │
│  - Validation                                           │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│           Configuration Middleware                      │
│  utils/configMiddleware.ts                             │
│  - Check API toggles                                    │
│  - Enforce scrape limits                                │
│  - Apply rate throttling                                │
│  - Track usage                                          │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│           Existing Systems (Unchanged)                  │
│  - enrichData.ts (wrapped, not modified)               │
│  - Background jobs (enhanced, not replaced)             │
│  - API routes (guarded, not changed)                    │
└─────────────────────────────────────────────────────────┘
```

---

## Implementation Strategy

### Phase 1: Configuration Foundation (Non-Breaking)

#### 1.1 Settings Storage System

**File**: `utils/settingsConfig.ts`

**Purpose**: Centralized settings management using existing file-based pattern

**Structure**:
```typescript
interface SettingsConfig {
  // Scrape Control
  scrapeLimits: {
    linkedin: { daily: number; monthly: number };
    facebook: { daily: number; monthly: number };
  };
  rateThrottle: 'safe' | 'normal' | 'aggressive';
  cooldownWindows: {
    enabled: boolean;
    errorThreshold: number; // errors per minute
    pauseDuration: number; // seconds
  };
  retryLogic: {
    maxRetries: number;
    backoffStrategy: 'exponential' | 'linear' | 'fixed';
  };
  
  // Platform Profiles
  scrapeProfiles: ScrapeProfile[];
  
  // API Controls
  apiToggles: {
    [apiName: string]: {
      enabled: boolean;
      costPer1000: number;
      dependencies?: string[]; // APIs that depend on this
    };
  };
  
  // Scheduling
  scheduling: {
    businessHoursOnly: boolean;
    avoidWeekends: boolean;
    timezone: string;
    loadBalancing: boolean;
    conditionalRules: ConditionalRule[];
  };
  
  // Output & Routing
  output: {
    defaultDestination: 'csv' | 'webhook' | 'crm' | 'dashboard';
    webhookUrl?: string;
    webhookRetryRules: RetryConfig;
    fieldMapping?: Record<string, string>;
  };
  
  // Notifications
  notifications: {
    scrapeStarted: boolean;
    scrapeCompleted: boolean;
    errorsDetected: boolean;
    quotaApproaching: boolean;
    jobAutoPaused: boolean;
    channels: ('email' | 'webhook')[];
  };
}
```

**Storage**: `data/settings.json` (single file, file-locked writes)

**Default Values**: All features disabled by default (backward compatible)

---

#### 1.2 Settings API Routes

**File**: `app/api/settings/route.ts`

**Endpoints**:
- `GET /api/settings` - Load current settings
- `PUT /api/settings` - Update settings (with validation)
- `GET /api/settings/usage` - Get current usage stats (daily/monthly)

**Validation**: Server-side validation before saving

---

#### 1.3 Settings Page Component

**File**: `app/settings/page.tsx`

**Structure**: Tabbed interface
- Tab 1: Scrape Control & Safety
- Tab 2: Platform Profiles
- Tab 3: API Controls & Cost Calculator
- Tab 4: Scheduling
- Tab 5: Output & Routing
- Tab 6: Notifications

**Navigation**: Add to Sidebar navItems

---

### Phase 2: Scrape Control & Safety (Guards Layer)

#### 2.1 Usage Tracking System

**File**: `utils/scrapeUsageTracker.ts`

**Purpose**: Track daily/monthly scrape counts per platform

**Storage**: `data/scrape-usage.json`
```typescript
{
  "linkedin": {
    "2025-01-15": { count: 150, jobs: ["job1", "job2"] },
    "monthly": { "2025-01": 1500 }
  },
  "facebook": {
    "2025-01-15": { count: 50, jobs: ["job3"] },
    "monthly": { "2025-01": 500 }
  }
}
```

**Integration Points**:
- Before scraping: Check limits in `/api/jobs/scrape` and `/api/linkedin-sales-navigator`
- Before Facebook discovery: Check limits in `/api/facebook-discovery`
- After scraping: Increment counters (file-locked)

**Hard Stop**: Return 429-like error when limit hit (prevents waste)

---

#### 2.2 Rate Throttling Middleware

**File**: `utils/rateThrottle.ts`

**Purpose**: Apply delays between API calls based on "Safe/Normal/Aggressive" setting

**Implementation**:
```typescript
const THROTTLE_DELAYS = {
  safe: 3000,    // 3 seconds between calls
  normal: 2000, // 2 seconds
  aggressive: 1000 // 1 second
};

async function throttleAPI(apiName: string): Promise<void> {
  const settings = await loadSettings();
  const delay = THROTTLE_DELAYS[settings.rateThrottle || 'normal'];
  await new Promise(resolve => setTimeout(resolve, delay));
}
```

**Integration**: Wrap `callAPI()` in `enrichData.ts` (non-breaking wrapper)

---

#### 2.3 Cooldown Window System

**File**: `utils/cooldownManager.ts`

**Purpose**: Auto-pause scraping if error rate spikes

**Logic**:
- Track errors per minute in sliding window
- If errors > threshold: pause all scraping
- Resume after cooldown duration
- Store pause state in `data/cooldown-state.json`

**Integration**: Check before each scrape job starts

---

#### 2.4 Retry Logic Configuration

**File**: `utils/retryConfig.ts`

**Purpose**: Make retry behavior configurable

**Integration**: 
- Inngest functions already have retries (2-3)
- Add configurable retry count
- Add backoff strategy selection
- Wrap existing retry logic with config

---

### Phase 3: Platform-Specific Profiles

#### 3.1 Profile Storage

**File**: `data/scrape-profiles.json`

**Structure**:
```typescript
interface ScrapeProfile {
  id: string;
  name: string;
  platform: 'linkedin' | 'facebook';
  filters: {
    // LinkedIn
    jobTitle?: string;
    location?: string;
    companySize?: string;
    isSelfEmployed?: boolean;
    // Facebook
    groupId?: string;
    keywords?: string[];
  };
  schedule?: {
    enabled: boolean;
    cronExpression: string;
    timezone: string;
  };
  enrichmentRules?: {
    skipAPIs?: string[]; // Which APIs to skip for this profile
  };
}
```

#### 3.2 Profile Management UI

**Location**: Settings page, Tab 2

**Features**:
- Create/Edit/Delete profiles
- Test profile (dry-run)
- Duplicate profile
- Profile templates

#### 3.3 Profile Execution

**Integration**: 
- New API: `POST /api/jobs/scrape-profile` - Execute a profile
- Uses existing scrape/enrich endpoints with profile config
- Schedules via Inngest if profile has schedule

---

### Phase 4: API Controls & Cost Calculator

#### 4.1 API Registry

**File**: `utils/apiRegistry.ts`

**Purpose**: Central registry of all APIs with metadata

**Structure**:
```typescript
const API_REGISTRY = {
  'linkedin-scraper': {
    name: 'LinkedIn Scraper',
    costPer1000: 15.00,
    dependencies: [],
    category: 'scraping',
  },
  'facebook-scraper': {
    name: 'Facebook Scraper',
    costPer1000: 10.00,
    dependencies: [],
    category: 'scraping',
  },
  'skip-tracing': {
    name: 'Skip Tracing',
    costPer1000: 25.00,
    dependencies: [],
    category: 'enrichment',
  },
  'telnyx-lookup': {
    name: 'Telnyx Lookup',
    costPer1000: 4.00,
    dependencies: ['skip-tracing'], // Auto-disables if skip-tracing off
    category: 'enrichment',
  },
  'dnc-scrub': {
    name: 'DNC Scrubbing',
    costPer1000: 2.00,
    locked: true, // Always enabled
    category: 'compliance',
  },
  // ... all other APIs
};
```

#### 4.2 API Toggle Middleware

**File**: `utils/apiToggleMiddleware.ts`

**Purpose**: Intercept API calls and skip if disabled

**Integration Point**: Wrap `callAPI()` in `enrichData.ts`

**Implementation**:
```typescript
async function callAPIWithToggle(
  url: string,
  options: RequestInit,
  apiName: string
): Promise<{ data?: any; error?: string }> {
  const settings = await loadSettings();
  const apiConfig = settings.apiToggles[apiName];
  
  // Check if API is enabled
  if (apiConfig && !apiConfig.enabled) {
    console.log(`[API_TOGGLE] ${apiName} is disabled, skipping`);
    return { data: null }; // Return null, pipeline continues
  }
  
  // Check dependencies
  if (apiConfig?.dependencies) {
    for (const dep of apiConfig.dependencies) {
      const depConfig = settings.apiToggles[dep];
      if (depConfig && !depConfig.enabled) {
        console.log(`[API_TOGGLE] ${apiName} disabled because dependency ${dep} is off`);
        return { data: null };
      }
    }
  }
  
  // Proceed with normal API call
  return await callAPI(url, options, apiName);
}
```

**Non-Breaking**: Disabled APIs return `null`, enrichment continues

#### 4.3 Cost Calculator Component

**Location**: Settings page, Tab 3

**Features**:
- Toggle each API ON/OFF
- Show cost per 1,000 leads
- Show dependencies (auto-disable with label)
- Live total calculation
- Sticky footer with total cost

**Implementation**:
- Client-side calculation (instant updates)
- Server-side validation on save

---

### Phase 5: Scheduling Intelligence

#### 5.1 Scheduling Layer

**File**: `utils/schedulingManager.ts`

**Purpose**: Intelligent scheduling on top of Inngest

**Features**:
- Business hours detection
- Weekend avoidance
- Timezone awareness
- Load balancing (spread jobs across day)
- Conditional rules (e.g., "only if LinkedIn completed")

**Integration**: 
- Wrap Inngest event triggers
- Add delay/schedule logic before triggering
- Use Inngest's built-in scheduling if available

#### 5.2 Conditional Scheduling

**Logic**:
- Check job status before triggering dependent jobs
- Check enrichment backlog before scraping
- Pause if conditions not met

**Storage**: Conditional rules in settings config

---

### Phase 6: Output & Routing

#### 6.1 Output Router

**File**: `utils/outputRouter.ts`

**Purpose**: Route enriched leads to different destinations

**Destinations**:
- CSV (existing - no change)
- Webhook (new)
- CRM (future - placeholder)
- Dashboard only (existing - no change)

#### 6.2 Webhook Integration

**File**: `utils/webhookSender.ts`

**Purpose**: Send enriched leads to webhook URL

**Features**:
- Retry logic (configurable)
- Field mapping
- Batch sending
- Error handling

**Storage**: Webhook config in settings

---

### Phase 7: Notifications & Alerts

#### 7.1 Notification System

**File**: `utils/notifications.ts`

**Purpose**: Send alerts based on events

**Channels**:
- In-app (toast notifications)
- Webhook (POST to URL)
- Email (future - placeholder)

**Events**:
- Scrape started/completed
- Errors detected
- Quota approaching
- Job auto-paused

**Implementation**: 
- Event emitter pattern
- Subscribe to job status changes
- Check settings before sending

---

## File Structure

```
app/
  settings/
    page.tsx                    # Settings page (tabbed UI)
  api/
    settings/
      route.ts                  # GET/PUT settings
      usage/
        route.ts                # GET usage stats
    jobs/
      scrape-profile/
        route.ts                # Execute scrape profile

utils/
  settingsConfig.ts             # Load/save settings (file-based)
  configMiddleware.ts            # Apply config to operations
  scrapeUsageTracker.ts          # Track daily/monthly usage
  rateThrottle.ts                # Rate limiting delays
  cooldownManager.ts             # Error spike detection
  retryConfig.ts                 # Configurable retries
  apiRegistry.ts                 # API metadata & costs
  apiToggleMiddleware.ts         # Skip disabled APIs
  schedulingManager.ts           # Intelligent scheduling
  outputRouter.ts                # Route to destinations
  webhookSender.ts               # Webhook integration
  notifications.ts                # Alert system

data/
  settings.json                  # Main settings file
  scrape-usage.json              # Daily/monthly counters
  scrape-profiles.json           # User-defined profiles
  cooldown-state.json            # Current cooldown status
```

---

## Integration Points (Non-Breaking)

### 1. Enrichment Pipeline Integration

**Current**: `utils/enrichData.ts` → `callAPI()`

**Change**: Wrap `callAPI()` with middleware

```typescript
// Before (existing)
const { data, error } = await callAPI(url, options, apiName);

// After (wrapped, non-breaking)
const { data, error } = await callAPIWithConfig(url, options, apiName);
// callAPIWithConfig checks:
// - API toggle (skip if disabled)
// - Rate throttle (add delay)
// - Returns null if disabled (pipeline continues)
```

**Impact**: Zero breaking changes, disabled APIs simply return null

---

### 2. Scraping Integration

**Current**: `/api/jobs/scrape`, `/api/linkedin-sales-navigator`, `/api/facebook-discovery`

**Change**: Add guards at start of each route

```typescript
// Check limits before scraping
const usage = await getScrapeUsage('linkedin');
if (usage.daily >= settings.scrapeLimits.linkedin.daily) {
  return NextResponse.json({ error: 'Daily limit reached' }, { status: 429 });
}

// Check cooldown
if (await isInCooldown()) {
  return NextResponse.json({ error: 'System in cooldown' }, { status: 503 });
}

// Proceed with existing logic...
```

**Impact**: Returns errors early, no code changes to scraping logic

---

### 3. Background Jobs Integration

**Current**: Inngest functions with fixed retries

**Change**: Wrap Inngest event triggers with scheduling

```typescript
// Before
await inngest.send({ name: 'scraping/scrape-linkedin', data: {...} });

// After
await scheduleJobIfAllowed({ name: 'scraping/scrape-linkedin', data: {...} });
// scheduleJobIfAllowed checks:
// - Business hours
// - Weekend avoidance
// - Conditional rules
// - Then triggers Inngest event
```

**Impact**: Jobs may be delayed, but still execute (no breaking)

---

### 4. Output Integration

**Current**: CSV export in UI components

**Change**: Add routing layer after enrichment

```typescript
// After enrichment completes
const output = await getOutputConfig();
if (output.defaultDestination === 'webhook') {
  await sendToWebhook(enrichedLeads);
} else if (output.defaultDestination === 'csv') {
  // Existing CSV logic (unchanged)
}
```

**Impact**: Adds new destinations, CSV still works

---

## Data Flow Examples

### Example 1: Scraping with Limits

```
User clicks "Run LinkedIn Scan"
    ↓
API Route: /api/linkedin-sales-navigator
    ↓
Check: scrapeUsageTracker.getDailyCount('linkedin')
    ↓
If count >= settings.scrapeLimits.linkedin.daily:
    → Return 429 error (hard stop)
    ↓
Else:
    → Proceed with existing scrape logic
    → After scrape: increment counter
```

### Example 2: Enrichment with API Toggles

```
enrichRow() called
    ↓
Step 3: Skip Tracing needed
    ↓
callAPIWithConfig('/api/skip-tracing', ...)
    ↓
Check: settings.apiToggles['skip-tracing'].enabled
    ↓
If disabled:
    → Return { data: null }
    → Pipeline continues (phone stays empty)
    ↓
If enabled:
    → Apply rate throttle (delay)
    → Call API normally
    → Return data
```

### Example 3: Scheduled Profile Execution

```
Inngest cron trigger (or manual)
    ↓
schedulingManager.checkSchedule(profile)
    ↓
Check: Business hours? Weekend? Timezone?
    ↓
If not allowed:
    → Reschedule for next allowed time
    ↓
If allowed:
    → Check conditional rules
    → If conditions met: Execute profile
    → Trigger scrape with profile filters
```

---

## Backward Compatibility Strategy

### Default Settings (All Features Disabled)

```typescript
const DEFAULT_SETTINGS: SettingsConfig = {
  scrapeLimits: {
    linkedin: { daily: Infinity, monthly: Infinity },
    facebook: { daily: Infinity, monthly: Infinity },
  },
  rateThrottle: 'normal', // Existing behavior
  cooldownWindows: { enabled: false, ... },
  retryLogic: { maxRetries: 3, backoffStrategy: 'exponential' }, // Existing
  scrapeProfiles: [],
  apiToggles: {}, // All APIs enabled by default (empty = all on)
  scheduling: {
    businessHoursOnly: false,
    avoidWeekends: false,
    timezone: 'UTC',
    loadBalancing: false,
    conditionalRules: [],
  },
  output: {
    defaultDestination: 'csv', // Existing behavior
  },
  notifications: {
    scrapeStarted: false,
    scrapeCompleted: false,
    errorsDetected: false,
    quotaApproaching: false,
    jobAutoPaused: false,
    channels: [],
  },
};
```

**Result**: If settings file doesn't exist, system behaves exactly as it does now.

---

## Cost Calculation Logic

### Per-API Costs (Per 1,000 Leads)

Based on typical RapidAPI pricing:

```typescript
const API_COSTS = {
  'linkedin-scraper': 15.00,      // LinkedIn Sales Navigator
  'facebook-scraper': 10.00,      // Facebook Scraper API
  'skip-tracing': 25.00,          // Skip Tracing API
  'telnyx-lookup': 4.00,          // Telnyx (if skip-tracing enabled)
  'income-by-zip': 1.00,          // Income API (if zip available)
  'website-contacts': 5.00,       // Website Contacts (if domain available)
  'website-extractor': 3.00,      // Website Extractor (if domain available)
  'linkedin-profile': 2.00,      // LinkedIn Profile (if URL available)
  'fresh-linkedin-profile': 3.00, // Fresh LinkedIn (if URL available)
  'dnc-scrub': 2.00,              // USHA DNC (always on, locked)
};
```

### Calculation Formula

```typescript
function calculateCost(settings: SettingsConfig, leadCount: number = 1000): number {
  let total = 0;
  
  for (const [apiName, config] of Object.entries(settings.apiToggles)) {
    if (config.enabled) {
      const cost = (config.costPer1000 / 1000) * leadCount;
      total += cost;
    }
  }
  
  return total;
}
```

**Display**: 
- Per 1,000 leads: `$XX.XX`
- Per lead: `$X.XXX`

---

## Error Handling & Edge Cases

### 1. Settings File Corruption

**Handling**: 
- Validate JSON on load
- If invalid: Use defaults + log error
- Auto-backup before write

### 2. Concurrent Settings Updates

**Handling**: 
- Use file locking (`withLock` from `fileLock.ts`)
- Last write wins (with timestamp)
- Log conflicts

### 3. Missing Settings File

**Handling**: 
- Return defaults (backward compatible)
- Create file on first save

### 4. API Dependency Conflicts

**Handling**: 
- Auto-disable dependent APIs with clear label
- Show warning in UI
- Prevent enabling parent if child is disabled

### 5. Limit Reached Mid-Job

**Handling**: 
- Check limits before each page/batch
- Stop gracefully (save progress)
- Return partial results

---

## Performance Considerations

### 1. Settings File Size

**Strategy**: Single JSON file (small, <10KB even with many profiles)

**Optimization**: 
- Lazy load settings (cache in memory)
- Invalidate cache on file change
- Use file locking for writes

### 2. Usage Tracking Overhead

**Strategy**: 
- Batch writes (update every N operations)
- Use file locking
- Cleanup old daily records (keep last 30 days)

### 3. API Toggle Checks

**Strategy**: 
- Cache settings in memory
- Check once per enrichment batch
- Minimal overhead (simple boolean check)

---

## Security Considerations

### 1. Settings File Access

**Strategy**: 
- Server-side only (API routes)
- No client-side file access
- Validate all inputs

### 2. Webhook URLs

**Strategy**: 
- Validate URL format
- Rate limit webhook calls
- Sanitize data before sending

### 3. Cost Calculation

**Strategy**: 
- Client-side for UX (instant feedback)
- Server-side validation on save
- Prevent manipulation

---

## Testing Strategy

### 1. Unit Tests

- Settings load/save
- Usage tracking
- API toggle logic
- Cost calculation
- Scheduling logic

### 2. Integration Tests

- Enrichment with disabled APIs
- Scraping with limits
- Profile execution
- Webhook delivery

### 3. E2E Tests

- Settings page workflow
- Scrape with limits (hard stop)
- API toggle (skip enrichment step)
- Scheduled profile execution

---

## Migration Path

### Phase 1: Foundation (Week 1)
- Settings storage system
- Settings API routes
- Settings page UI (basic)
- **No integration yet** (safe to deploy)

### Phase 2: Scrape Controls (Week 2)
- Usage tracking
- Limit enforcement
- Rate throttling
- **Guards only** (existing code unchanged)

### Phase 3: API Controls (Week 3)
- API registry
- Toggle middleware
- Cost calculator UI
- **Wrap enrichData.ts** (non-breaking)

### Phase 4: Advanced Features (Week 4)
- Profiles
- Scheduling
- Output routing
- Notifications

---

## Risk Assessment

### Low Risk ✅
- Settings storage (proven pattern)
- Usage tracking (simple counters)
- API toggles (wrapper pattern)

### Medium Risk ⚠️
- Scheduling layer (complex logic)
- Webhook integration (external dependency)
- Profile system (new workflow)

### Mitigation
- Feature flags (disable if issues)
- Gradual rollout (enable per feature)
- Rollback plan (delete settings file = defaults)

---

## Success Criteria

1. ✅ **Zero Breaking Changes**: Existing workflows work unchanged
2. ✅ **Backward Compatible**: No settings = current behavior
3. ✅ **Performance**: <50ms overhead per enrichment call
4. ✅ **Reliability**: Settings file corruption doesn't crash system
5. ✅ **User Experience**: Settings page loads in <1 second

---

## Critical Integration Details

### callAPI() Wrapper Implementation

**Current Function**: `utils/enrichData.ts` → `callAPI(url, options, apiName)`

**Wrapper Function**: `utils/apiToggleMiddleware.ts`

```typescript
/**
 * Wraps callAPI with settings-based controls
 * Non-breaking: Returns null if API disabled, pipeline continues
 */
export async function callAPIWithConfig(
  url: string,
  options: RequestInit,
  apiName: string
): Promise<{ data?: any; error?: string }> {
  // Load settings (cached in memory)
  const settings = await loadSettings();
  
  // Map API name to registry key
  const apiKey = mapAPINameToKey(apiName);
  const apiConfig = settings.apiToggles[apiKey];
  
  // Check if API is disabled
  if (apiConfig && !apiConfig.enabled) {
    console.log(`[API_TOGGLE] ${apiName} is disabled, skipping`);
    return { data: null }; // Non-breaking: return null, not error
  }
  
  // Check dependencies
  if (apiConfig?.dependencies) {
    for (const dep of apiConfig.dependencies) {
      const depConfig = settings.apiToggles[dep];
      if (depConfig && !depConfig.enabled) {
        console.log(`[API_TOGGLE] ${apiName} disabled: dependency ${dep} is off`);
        return { data: null };
      }
    }
  }
  
  // Apply rate throttling
  if (settings.rateThrottle) {
    await applyRateThrottle(settings.rateThrottle);
  }
  
  // Proceed with existing callAPI (unchanged)
  return await callAPI(url, options, apiName);
}
```

**Change in enrichData.ts**:
```typescript
// Before
import { callAPI } from './apiHelpers';

// After
import { callAPI } from './apiHelpers';
import { callAPIWithConfig } from './apiToggleMiddleware';

// Replace all callAPI() calls with callAPIWithConfig()
// (Simple find/replace, no logic changes)
```

**Impact**: Zero logic changes, just function name swap

---

### Scrape Limit Enforcement Points

**Location 1**: `app/api/linkedin-sales-navigator/route.ts`

```typescript
export async function POST(request: NextRequest) {
  // NEW: Check limits before processing
  const { checkScrapeLimit, incrementScrapeCount } = await import('@/utils/scrapeUsageTracker');
  const limitCheck = await checkScrapeLimit('linkedin');
  
  if (!limitCheck.allowed) {
    return NextResponse.json(
      { 
        error: 'Scrape limit reached',
        message: `Daily limit: ${limitCheck.dailyLimit}, Current: ${limitCheck.currentCount}`,
        limitType: limitCheck.limitType // 'daily' | 'monthly'
      },
      { status: 429 }
    );
  }
  
  // Existing scrape logic (unchanged)
  // ...
  
  // After successful scrape
  await incrementScrapeCount('linkedin', leadsCount);
}
```

**Location 2**: `app/api/facebook-discovery/route.ts` (same pattern)

**Location 3**: `app/api/jobs/scrape/route.ts` (background jobs)

---

### API Name Mapping

**Challenge**: API names in code don't match registry keys

**Solution**: Mapping function

```typescript
function mapAPINameToKey(apiName: string): string {
  const mapping: Record<string, string> = {
    'Skip-tracing': 'skip-tracing',
    'Skip-tracing (Phone Discovery)': 'skip-tracing',
    'Skip-tracing (Person Details)': 'skip-tracing',
    'Telnyx': 'telnyx-lookup',
    'Income by Zip': 'income-by-zip',
    'Website Extractor': 'website-extractor',
    'Website Contacts': 'website-contacts',
    'LinkedIn Profile': 'linkedin-profile',
    'Fresh LinkedIn Profile': 'fresh-linkedin-profile',
    // ... etc
  };
  
  return mapping[apiName] || apiName.toLowerCase().replace(/\s+/g, '-');
}
```

---

## Next Steps

1. **Review this plan** - Confirm approach
2. **Phase 1 implementation** - Settings foundation
3. **Incremental rollout** - One phase at a time
4. **User testing** - Validate UX before full deployment

---

**Plan Status**: Ready for review and approval before implementation begins.
