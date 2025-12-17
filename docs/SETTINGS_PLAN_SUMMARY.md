# Settings Implementation Plan - Executive Summary

## 🎯 Objective

Add comprehensive settings page with:
- Scrape control & safety (limits, throttling, cooldowns)
- Platform-specific profiles
- API controls & cost calculator
- Scheduling intelligence
- Output & routing
- Notifications

**Without breaking any existing functionality.**

---

## ✅ Key Architectural Decisions

### 1. **Non-Breaking Wrapper Pattern**
- Wrap existing `callAPI()` function
- Disabled APIs return `null` (pipeline continues)
- No logic changes to enrichment pipeline

### 2. **File-Based Configuration**
- Single file: `data/settings.json`
- Reuses existing file-locking pattern
- Defaults = current behavior (backward compatible)

### 3. **Guards at Entry Points**
- Check limits before scraping starts
- Early returns (429 errors)
- No changes to scraping logic

### 4. **Layered Architecture**
```
Settings UI → Settings Storage → Middleware → Existing Systems
```
Each layer is independent and can be disabled.

---

## 📊 Integration Points (Zero Breaking Changes)

### Enrichment Pipeline
- **Current**: `enrichData.ts` → `callAPI()`
- **Change**: Wrap `callAPI()` → `callAPIWithConfig()`
- **Impact**: Function name swap, no logic changes

### Scraping Routes
- **Current**: `/api/linkedin-sales-navigator`, `/api/facebook-discovery`
- **Change**: Add limit check at start
- **Impact**: Early return if limit hit, existing code unchanged

### Background Jobs
- **Current**: Inngest functions with retries
- **Change**: Add scheduling wrapper before triggering
- **Impact**: Jobs may be delayed, but still execute

---

## 💰 Cost Calculator Implementation

### API Registry
```typescript
{
  'linkedin-scraper': { costPer1000: 15.00, dependencies: [] },
  'facebook-scraper': { costPer1000: 10.00, dependencies: [] },
  'skip-tracing': { costPer1000: 25.00, dependencies: [] },
  'telnyx-lookup': { costPer1000: 4.00, dependencies: ['skip-tracing'] },
  'dnc-scrub': { costPer1000: 2.00, locked: true }, // Always on
  // ... all APIs
}
```

### Live Calculation
- Client-side: Instant updates as toggles change
- Server-side: Validation on save
- Sticky footer: `Estimated Cost: $XX.XX / 1,000 leads`

### Dependency Handling
- Auto-disable dependent APIs with clear label
- Example: Disable Skip Tracing → Telnyx auto-disables
- UI shows: "Disabled: Skip Tracing is off"

---

## 🛡️ Safety Features

### Scrape Limits
- **Daily/Monthly caps** per platform
- **Hard stop** when limit reached (429 error)
- **Usage tracking** in `data/scrape-usage.json`

### Rate Throttling
- **Safe**: 3s between calls
- **Normal**: 2s (default)
- **Aggressive**: 1s
- Applied via middleware delay

### Cooldown Windows
- **Error spike detection**: Track errors per minute
- **Auto-pause**: If errors > threshold
- **Auto-resume**: After cooldown duration
- **State**: Stored in `data/cooldown-state.json`

### Retry Logic
- **Configurable max retries** (default: 3)
- **Backoff strategies**: Exponential, Linear, Fixed
- **Integration**: Wrap Inngest retry config

---

## 📅 Scheduling Intelligence

### Business Hours
- **Detection**: Check current time vs business hours
- **Timezone**: Per-profile or global
- **Action**: Delay job until business hours

### Weekend Avoidance
- **Check**: Is today Saturday/Sunday?
- **Action**: Reschedule for Monday

### Load Balancing
- **Goal**: Spread jobs across day
- **Method**: Calculate optimal start times
- **Implementation**: Delay triggers based on existing jobs

### Conditional Rules
- **Example**: "Only scrape Facebook if LinkedIn completed"
- **Check**: Job status before triggering
- **Action**: Wait or skip if condition not met

---

## 🔌 Output & Routing

### Destinations
1. **CSV** (existing - unchanged)
2. **Webhook** (new)
3. **CRM** (future placeholder)
4. **Dashboard only** (existing - unchanged)

### Webhook Integration
- **Retry logic**: Configurable attempts
- **Field mapping**: Map internal fields to webhook format
- **Batch sending**: Group leads for efficiency
- **Error handling**: Log failures, continue processing

---

## 🔔 Notifications

### Events
- Scrape started/completed
- Errors detected
- Quota approaching (80% threshold)
- Job auto-paused

### Channels
- **In-app**: Toast notifications (immediate)
- **Webhook**: POST to URL (for integrations)
- **Email**: Future (placeholder)

### Implementation
- Event emitter pattern
- Subscribe to job status changes
- Check settings before sending

---

## 📁 File Structure

```
app/
  settings/
    page.tsx                    # Settings page (6 tabs)
  api/
    settings/
      route.ts                 # GET/PUT settings
      usage/
        route.ts               # GET usage stats

utils/
  settingsConfig.ts            # Load/save settings
  scrapeUsageTracker.ts        # Daily/monthly counters
  apiToggleMiddleware.ts       # Wrap callAPI()
  rateThrottle.ts              # Apply delays
  cooldownManager.ts           # Error spike detection
  schedulingManager.ts         # Intelligent scheduling
  outputRouter.ts              # Route to destinations
  webhookSender.ts             # Webhook integration
  notifications.ts              # Alert system
  apiRegistry.ts               # API metadata & costs

data/
  settings.json                # Main config (single file)
  scrape-usage.json            # Usage counters
  scrape-profiles.json          # User profiles
  cooldown-state.json          # Current cooldown status
```

---

## ⚡ Performance Impact

### Settings Loading
- **First load**: ~5ms (read JSON file)
- **Cached**: <1ms (memory cache)
- **File size**: <10KB (even with many profiles)

### API Toggle Checks
- **Overhead**: <1ms per check (boolean lookup)
- **Frequency**: Once per API call
- **Impact**: Negligible

### Usage Tracking
- **Write frequency**: Every N operations (batched)
- **Write time**: ~10ms (file write with lock)
- **Impact**: Async, doesn't block scraping

### Total Overhead
- **Per enrichment call**: <5ms
- **Per scrape job**: <50ms (limit check + usage update)
- **Acceptable**: Yes (minimal impact)

---

## 🔄 Backward Compatibility

### Default Settings
```typescript
{
  scrapeLimits: { linkedin: { daily: Infinity }, facebook: { daily: Infinity } },
  rateThrottle: 'normal', // Existing behavior
  apiToggles: {}, // Empty = all APIs enabled
  scheduling: { businessHoursOnly: false, avoidWeekends: false },
  output: { defaultDestination: 'csv' }, // Existing behavior
  notifications: { /* all false */ }
}
```

### Missing Settings File
- **Behavior**: Use defaults
- **Result**: System works exactly as it does now
- **Migration**: None needed

### Disabled Features
- **API toggles**: Return null, pipeline continues
- **Scrape limits**: Not enforced if Infinity
- **Scheduling**: Jobs execute immediately if disabled
- **Result**: No breaking changes

---

## 🚀 Implementation Phases

### Phase 1: Foundation (Week 1) ✅ Safe
- Settings storage
- Settings API
- Basic UI
- **Risk**: Low (no integration)

### Phase 2: API Controls (Week 2) ✅ Safe
- API registry
- Toggle middleware
- Cost calculator
- **Risk**: Low (wrapper pattern)

### Phase 3: Scrape Controls (Week 3) ⚠️ Medium
- Usage tracking
- Limit enforcement
- Rate throttling
- **Risk**: Medium (guards at entry points)

### Phase 4: Advanced (Week 4) ⚠️ Medium
- Profiles
- Scheduling
- Output routing
- Notifications
- **Risk**: Medium (new workflows)

---

## ✅ Success Criteria

1. ✅ Zero breaking changes
2. ✅ Backward compatible (no settings = current behavior)
3. ✅ Performance: <50ms overhead per operation
4. ✅ Reliability: Settings corruption doesn't crash system
5. ✅ UX: Settings page loads in <1 second

---

## 📋 Next Steps

1. **Review this plan** - Confirm architectural approach
2. **Approve implementation order** - Phase-by-phase rollout
3. **Begin Phase 1** - Settings foundation (safe, no integration)
4. **Test each phase** - Validate before next phase

---

**Status**: ✅ Plan Complete - Ready for Review

**Full Details**: See `docs/SETTINGS_IMPLEMENTATION_PLAN.md`
