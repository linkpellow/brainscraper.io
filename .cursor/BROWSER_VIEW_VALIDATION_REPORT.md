# Browser View Implementation - Success Criteria Validation

## Executive Summary

**Overall Status**: ⚠️ **40% Complete - Core Infrastructure Ready, Integration Pending**

The foundation is solid but critical integration work remains. Core services (bridge extension, capture service, decision engine) are implemented but not connected to the UI.

---

## A. Launch & Windowing ❌ **NOT IMPLEMENTED**

### Status: ❌ **FAILING**

**Current State**:
- `launch-browser/route.ts` launches a basic Playwright browser
- Does NOT use `BrowserCaptureService`
- Does NOT create a Traffic/Log View window
- Does NOT return session ID
- Single browser window only (no dual-window setup)

**Missing Functionality**:
1. ❌ No `BrowserCaptureService` integration
2. ❌ No separate Traffic/Log View window
3. ❌ No Signal Stream component
4. ❌ No Pipeline Sequence component
5. ❌ No session ID tracking or return

**Required Changes**:
- Integrate `BrowserCaptureService` into `/api/explorer/launch-browser`
- Create Traffic/Log View window (separate React component)
- Return session ID to frontend
- Coordinate browser window + log view window lifecycle

**Files to Modify**:
- `app/api/explorer/launch-browser/route.ts` (integrate BrowserCaptureService)
- New component: `BrowserTrafficView.tsx` (dual window setup)
- `app/tools/api-signal-explorer/NeuromapWorkspace.tsx` (launch integration)

---

## B. Unified System Sync (Legacy + Neuromap) ⚠️ **PARTIAL**

### Status: ⚠️ **PARTIALLY IMPLEMENTED**

**Current State**:
- ✅ WebSocket bridge extends `/browser` endpoint for browser-source events
- ✅ Events normalized with `source: 'browser'` marker
- ✅ Bridge broadcasts `events_batch` to all explorer clients
- ⚠️ `useWebSocket` hook processes `events_batch` but hardcodes `source: 'browser'`
- ❌ `page.tsx` (Legacy) handles `events_batch` but doesn't check source field
- ❌ `NeuromapWorkspace.tsx` doesn't handle `browser_action` messages

**Issues Found**:
1. **CRITICAL BUG - Line 53 in `useWebSocket.ts`**: Listens for `'flow'` messages but bridge sends `'events_batch'`
   ```typescript
   if (data.type === 'flow') {  // ❌ Bridge sends 'events_batch', not 'flow'
   ```
   This means NeuromapWorkspace will NOT receive any browser events!

2. **Line 74 in `useWebSocket.ts`**: Hardcodes `source: 'browser'` for all events
   ```typescript
   source: 'browser',  // ❌ Should use event.source if available from bridge
   ```

3. **Missing Action Event Handling**: Neither mode handles `browser_action` messages from bridge

4. **Source Field Missing**: `page.tsx` doesn't set `source` field when processing `events_batch`
   - Events processed but source not tracked
   - Needs to use `flow.source` from bridge events

**Required Fixes**:
1. Update `useWebSocket.ts` to preserve `source` from bridge events
2. Add `browser_action` message handling in both modes
3. Verify source field propagation through pipeline
4. Test with mobile + browser events simultaneously

**Files to Modify**:
- `app/tools/api-signal-explorer/hooks/useWebSocket.ts` (fix source field)
- `app/tools/api-signal-explorer/page.tsx` (add browser_action handling)
- `app/tools/api-signal-explorer/NeuromapWorkspace.tsx` (add browser_action handling)

---

## C. Interaction Capture (DOM Intent) ⚠️ **PARTIAL**

### Status: ⚠️ **PARTIALLY IMPLEMENTED**

**Current State**:
- ✅ `BrowserCaptureService` has DOM interaction tracking script
- ✅ Tracks click, change, submit events
- ✅ Generates selectors (id, class, tag fallback)
- ✅ Captures XPath via helper function
- ✅ Captures URL context
- ⚠️ Missing: testid, aria-label priority selection
- ❌ Missing: Element state capture (value, checked, enabled)
- ❌ Not integrated with launch-browser endpoint

**Current Implementation** (from `browserCapture.ts`):
- ✅ Clicks tracked with selector + XPath
- ✅ Form changes tracked with value length
- ✅ Form submissions tracked
- ⚠️ Selector priority: id → class → tag (missing testid, aria-label priority)
- ❌ No element state capture
- ❌ Not connected to endpoint

**Missing Functionality**:
1. Robust selector priority: `testid` → `aria-label` → `id` → `text` → `CSS`
2. Element state: value, checked, enabled, disabled
3. Page title context
4. Integration with launch-browser

**Required Fixes**:
- Update injected script to prioritize testid/aria-label
- Add element state capture
- Integrate with launch-browser endpoint

**Files to Modify**:
- `src/server/browserCapture.ts` (enhance selector logic, add state capture)

---

## D. Correlation (Intent ↔ Network Delta) ⚠️ **PARTIAL**

### Status: ⚠️ **PARTIALLY IMPLEMENTED**

**Current State**:
- ✅ `BrowserCaptureService` creates capture sessions per interaction
- ✅ Baseline events tracked
- ✅ Network idle detection (2-second threshold)
- ✅ Capture timeout (10-second max)
- ⚠️ Capture sessions not integrated with existing `correlate.ts` engine
- ❌ No deduplication by method+url+body hash
- ❌ No redirect chain tracking
- ❌ Capture sessions don't create `PipelineCandidateStep` automatically

**Current Implementation**:
- Capture sessions track baseline vs captured events
- Network idle triggers session completion
- Events sent to bridge but not correlated to actions

**Missing Functionality**:
1. Integration with `correlateActionToNetwork()` function
2. Deduplication using body hash
3. Redirect chain preservation
4. Automatic `PipelineCandidateStep` creation from completed sessions

**Required Fixes**:
- Connect capture session completion to correlation engine
- Add body hash deduplication
- Track redirect chains
- Auto-create pipeline candidate steps

**Files to Modify**:
- `src/server/browserCapture.ts` (add correlation on session complete)
- `src/tools/api-signal-explorer/correlate.ts` (enhance for capture sessions)

---

## E. Network Capture Completeness ✅ **MOSTLY IMPLEMENTED**

### Status: ✅ **GOOD** (with caveats)

**Current State**:
- ✅ Request: method, URL, headers captured
- ✅ Response: status, headers captured
- ✅ Request body captured (50KB limit)
- ✅ Response body captured (100KB limit, JSON/text only)
- ✅ Query params handled
- ⚠️ GraphQL not specifically handled (treated as JSON)
- ⚠️ Multipart form not parsed (sent as text)
- ✅ Binary responses skip body capture (safe)

**Implementation Details** (from `browserCapture.ts`):
```typescript
// Request body: truncated at 50KB
reqBodyText = postData.length > 50000 ? postData.substring(0, 50000) + '...' : postData;

// Response body: JSON/text only, 100KB limit
if (mimeType.includes('application/json') || mimeType.includes('text/')) {
  if (body.length > 100000) {
    resBodyText = Buffer.from(body).toString('utf8', 0, 100000) + '...';
  }
}
```

**Minor Gaps**:
1. GraphQL detection/parsing (optional enhancement)
2. Multipart form parsing (optional enhancement)

**Status**: ✅ **ACCEPTABLE** - Core capture works, edge cases handled safely

---

## F. Noise Suppression ⚠️ **PARTIAL**

### Status: ⚠️ **PARTIALLY IMPLEMENTED**

**Current State**:
- ✅ OPTIONS requests filtered in correlation
- ✅ Very small responses (<100 bytes) filtered
- ✅ Static assets (image/, font/, text/css) filtered
- ⚠️ Polling detection exists but not used in capture service
- ❌ No UI toggle for raw stream
- ❌ No metadata for "why filtered"

**Implementation**:
- Basic filtering in `pipeline-candidate.ts` (determineAutomationStrategy)
- Existing polling detection in `correlate.ts` not integrated
- No UI controls for noise suppression

**Missing Functionality**:
1. Apply noise filters in capture service
2. Add "Show Raw Stream" toggle in UI
3. Include filter metadata with events

**Files to Modify**:
- `src/server/browserCapture.ts` (add noise filtering)
- New component: Noise filter toggle in UI

---

## G. Pipeline Step Formation ❌ **NOT IMPLEMENTED**

### Status: ❌ **FAILING**

**Current State**:
- ✅ `PipelineCandidateStep` type defined
- ✅ `createPipelineCandidateStep()` function exists
- ❌ Not called from capture service
- ❌ Not displayed in UI
- ❌ No Signal Stream component to show steps
- ❌ No Pipeline Sequence component

**Missing Functionality**:
1. Auto-create steps from completed capture sessions
2. Display steps in UI
3. User actions (Lock/Reject/Rename)
4. Step persistence

**Required Changes**:
- Connect capture session completion to step creation
- Create Signal Stream component
- Create Pipeline Sequence component
- Add step management UI

**Files to Create/Modify**:
- New: `components/SignalStream.tsx`
- New: `components/PipelineSequence.tsx`
- `src/server/browserCapture.ts` (create steps on session complete)
- `app/tools/api-signal-explorer/NeuromapWorkspace.tsx` (integrate components)

---

## H. API-First Decision Engine ✅ **IMPLEMENTED**

### Status: ✅ **COMPLETE**

**Current State**:
- ✅ `determineAutomationStrategy()` function fully implemented
- ✅ Detects mutations (POST/PUT/PATCH/DELETE)
- ✅ Checks derivable request bodies
- ✅ Validates auth requirements
- ✅ Identifies complex payload issues
- ✅ Provides confidence scores and reasons
- ❌ Not used in UI yet

**Implementation Quality**: ✅ **EXCELLENT**

**Decision Logic**:
- API-first when: mutation + derivable body + auth available
- Browser script when: no clear endpoint or complex payload
- Confidence scoring (0-1) with explainable reasons

**Status**: ✅ **READY** - Just needs UI integration

---

## I. Auth & Storage Capture ❌ **NOT IMPLEMENTED**

### Status: ❌ **FAILING**

**Current State**:
- ❌ Cookies not captured
- ❌ localStorage not captured
- ❌ sessionStorage not captured
- ❌ No secret redaction
- ❌ No reveal toggle

**Missing Functionality**:
1. Capture cookies per origin
2. Capture localStorage/sessionStorage
3. Redact secrets in UI by default
4. Provide reveal toggle for debugging

**Required Implementation**:
- Add Playwright context cookies capture
- Add localStorage/sessionStorage capture via evaluate
- Redact token patterns in UI
- Add reveal toggle

**Files to Modify**:
- `src/server/browserCapture.ts` (add storage capture)
- UI components (add redaction + reveal)

---

## J. HAR Export ❌ **NOT IMPLEMENTED**

### Status: ❌ **FAILING**

**Current State**:
- ❌ No HAR export generation
- ❌ No on-demand export
- ❌ No automatic export on session end
- ❌ No session ID tagging

**Missing Functionality**:
1. Generate HAR 1.2 format
2. Tag with session ID
3. On-demand export endpoint
4. Auto-export on session end

**Required Implementation**:
- Create HAR generation utility
- Add export endpoint
- Trigger on session end
- Include session metadata

**Files to Create/Modify**:
- New: `src/server/harGenerator.ts`
- `app/api/explorer/export-har/route.ts` (on-demand)
- `src/server/browserCapture.ts` (auto-export on close)

---

## K. Locked Step Usability ✅ **MOSTLY WORKS**

### Status: ✅ **GOOD** (for existing system)

**Current State**:
- ✅ Existing locked steps support code generation (curl, fetch, axios, Python)
- ✅ Test execution works
- ✅ JSON export includes locked steps
- ⚠️ Not yet tested with browser-source steps

**Implementation**:
- Code generators exist and work
- Test execution endpoint exists
- Export functionality exists

**Potential Issues**:
- Need to verify browser-source steps work with existing code generators
- May need minor adjustments for browser-specific data

**Status**: ✅ **LIKELY WORKS** - Needs testing with browser steps

---

## L. Local-Only Constraints ✅ **IMPLEMENTED**

### Status: ✅ **COMPLETE**

**Current State**:
- ✅ Production detection in launch-browser endpoint
- ✅ Clear error messages for missing mitmproxy
- ✅ Clear error messages for missing Playwright
- ✅ Proxy connection error handling
- ✅ Network error handling

**Error Messages**:
- "mitmproxy is not running on port {MITM_PORT}"
- "Chromium not installed. Run: npx playwright install chromium"
- "Proxy connection failed" with helpful instructions

**Status**: ✅ **EXCELLENT** - Comprehensive error handling

---

## M. Regression Safety ⚠️ **NEEDS VERIFICATION**

### Status: ⚠️ **LIKELY SAFE** (but needs testing)

**Current State**:
- ✅ WebSocket protocol unchanged (`events_batch`, `history`, etc.)
- ✅ Bridge backward compatible (mobile events still work)
- ⚠️ `useWebSocket` hook hardcodes `source: 'browser'` (potential issue)
- ❌ Not tested with mobile flow
- ❌ Not tested with mixed sources

**Potential Issues**:
1. **Line 74 in `useWebSocket.ts`**: Hardcodes `source: 'browser'` - should preserve source from event
2. Mobile events might not have `source` field (would default to undefined)
3. Need to test mixed mobile + browser events

**Required Verification**:
1. Test mobile flow still works
2. Fix `useWebSocket` source field handling
3. Test with mixed sources
4. Verify critical path analysis works with both sources

**Files to Fix**:
- `app/tools/api-signal-explorer/hooks/useWebSocket.ts` (fix source handling)

---

## Summary by Category

| Category | Status | Completion |
|----------|--------|------------|
| **A. Launch & Windowing** | ❌ | 0% |
| **B. Unified System Sync** | ⚠️ | 60% |
| **C. Interaction Capture** | ⚠️ | 70% |
| **D. Correlation** | ⚠️ | 50% |
| **E. Network Capture** | ✅ | 90% |
| **F. Noise Suppression** | ⚠️ | 40% |
| **G. Pipeline Step Formation** | ❌ | 20% |
| **H. API-First Decision** | ✅ | 100% |
| **I. Auth & Storage Capture** | ❌ | 0% |
| **J. HAR Export** | ❌ | 0% |
| **K. Locked Step Usability** | ✅ | 90% |
| **L. Local-Only Constraints** | ✅ | 100% |
| **M. Regression Safety** | ⚠️ | 80% |

---

## Critical Path to Completion

### Phase 1: Integration (High Priority)
1. **Fix `useWebSocket` source field** - Prevents regression
2. **Integrate BrowserCaptureService with launch-browser** - Enables capture
3. **Add browser_action message handling** - Enables action tracking

### Phase 2: UI Components (High Priority)
4. **Create Signal Stream component** - Shows events per interaction
5. **Create Pipeline Sequence component** - Shows candidate steps
6. **Integrate components into Neuromap workspace** - Enables workflow building

### Phase 3: Pipeline Integration (Medium Priority)
7. **Connect capture sessions to step creation** - Auto-generates steps
8. **Integrate with correlation engine** - Better attribution
9. **Add step locking UI** - User control

### Phase 4: Enhancement (Low Priority)
10. **Storage capture** - Auth/session data
11. **HAR export** - Audit trail
12. **Noise filter UI toggle** - User preference

---

## Recommended Next Steps

1. **Fix Source Field Bug** (30 min)
   - Update `useWebSocket.ts` to preserve source from events
   - Test with mobile events to ensure no regression

2. **Integrate Capture Service** (2-3 hours)
   - Connect BrowserCaptureService to launch-browser endpoint
   - Return session ID to frontend
   - Handle lifecycle (start/stop/cleanup)

3. **Create Signal Stream Component** (3-4 hours)
   - Display events grouped by interaction
   - Show strategy badges
   - Add filter controls

4. **Create Pipeline Sequence Component** (3-4 hours)
   - Display candidate steps
   - Add Lock/Reject/Rename actions
   - Integrate with existing pipeline system

5. **Connect Everything** (2-3 hours)
   - Auto-create steps from capture sessions
   - Wire up correlation
   - Test end-to-end flow

**Total Estimated Time**: 10-14 hours of focused work

---

**Last Updated**: 2025-01-XX
**Validation Status**: ✅ **Core infrastructure ready, integration work pending**
