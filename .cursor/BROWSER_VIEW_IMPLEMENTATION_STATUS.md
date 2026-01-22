# Browser View Implementation Status

## ✅ Completed Phases

### Phase 1: WebSocket Bridge Extension
**Status**: ✅ Complete
**Files Modified**:
- `src/server/wsMitmBridge.ts`

**Changes**:
- Added `/browser` WebSocket endpoint for browser capture service
- Extended `MitmFlowEvent` type to support browser-source events
- Added `browser_events`, `browser_action`, `browser_capture_start/stop` message types
- Normalized browser-source events into unified event stream
- Events from browser are now mixed with mobile-source events seamlessly

**Key Features**:
- Browser events get `source: 'browser'` marker
- Events normalized into same `MitmFlowEvent` format
- Bridge broadcasts to all explorer clients (Legacy + Neuromap)
- Action events are tracked separately in `actionHistory`

### Phase 2: Browser Capture Service
**Status**: ✅ Complete (Core Implementation)
**Files Created**:
- `src/server/browserCapture.ts`

**Key Features**:
- Playwright-based browser automation
- DOM interaction tracking (click, change, submit)
- Network request interception and capture
- Request/response body capture (with size limits)
- Interaction capture sessions with baseline tracking
- Network idle detection (2-second threshold)
- Session timeout (10-second max)
- Automatic correlation of actions to network events

**Architecture**:
- Injects interaction tracking script into page
- Tracks clicks, form changes, form submissions
- Captures network requests with full headers/bodies
- Creates capture sessions per interaction
- Sends normalized events to bridge via WebSocket

**Limitations**:
- Currently captures request/response bodies (may need optimization for large payloads)
- Storage capture (cookies/localStorage) not yet implemented
- HAR export not yet implemented

### Phase 3: Pipeline Candidate Steps & API-First Decision Engine
**Status**: ✅ Complete
**Files Created**:
- `src/tools/api-signal-explorer/pipeline-candidate.ts`

**Key Features**:
- `PipelineCandidateStep` type with all required fields
- `determineAutomationStrategy()` function that decides API vs browser script
- Comprehensive decision logic:
  - Detects mutations (POST/PUT/PATCH/DELETE)
  - Checks for derivable request bodies
  - Validates auth requirements
  - Identifies complex payload issues
  - Falls back to browser script when needed
- Strategy confidence scoring (0-1)
- Reasonable explanation bullets for UI display

**Decision Criteria**:
- **API-first** if: mutation endpoint + derivable body + auth available
- **Browser script** if: no clear endpoint, complex payload, or purely DOM manipulation

---

## 🚧 Remaining Phases

### Phase 4: Update Launch Browser Endpoint
**Status**: ⏳ Pending
**Files to Modify**:
- `app/api/explorer/launch-browser/route.ts`

**Required Changes**:
- Import and instantiate `BrowserCaptureService`
- Connect to bridge before launching browser
- Launch browser with capture service
- Return session info to frontend
- Handle browser window lifecycle
- Support stop/cleanup operations

**Notes**:
- Need to manage browser instance lifecycle
- Should return session ID to frontend
- Need error handling for bridge connection failures

### Phase 5: Enhanced Correlation Engine
**Status**: ⏳ Pending
**Files to Modify**:
- `src/tools/api-signal-explorer/correlate.ts`

**Required Changes**:
- Integrate capture session baselines
- Use interaction capture sessions for better attribution
- Handle browser-source events with improved timing
- Filter noise using baseline events

**Current State**:
- Existing correlation uses 2-second window
- Needs enhancement to use capture session data
- Should leverage baseline events from capture sessions

### Phase 6: Browser View UI Components
**Status**: ⏳ Pending
**Files to Create/Modify**:
- New component: Browser View window with dual panes
- Update `NeuromapWorkspace.tsx` for browser mode
- Create Signal Stream component
- Create Pipeline Sequence component

**Required Components**:
1. **Browser Window** (external Playwright window)
2. **Traffic/Log View Window** with:
   - Signal Stream (grouped events per interaction)
   - Pipeline Sequence (candidate steps)
   - Step actions (Lock/Reject/Rename)

**UI Requirements**:
- Show events grouped by interaction
- Display strategy badges (API vs Browser Script)
- Show confidence and reasons
- Enable step locking
- Persist locked steps to workflow

### Phase 7: Unified Event Store Integration
**Status**: ⏳ Pending
**Files to Modify**:
- `app/tools/api-signal-explorer/page.tsx` (Legacy mode)
- `app/tools/api-signal-explorer/NeuromapWorkspace.tsx` (Neuromap mode)
- `app/tools/api-signal-explorer/hooks/useWebSocket.ts`

**Required Changes**:
- Ensure both modes subscribe to unified stream
- Handle browser-source events in both modes
- Display browser events in Legacy mode endpoint list
- Use browser events in Neuromap workflow builder
- Sync state between modes (same session, same data)

**Current State**:
- `useWebSocket` hook already receives events
- Both modes use the same hook
- Need to ensure browser-source events are processed correctly

### Phase 8: HAR Export
**Status**: ⏳ Pending
**Files to Create/Modify**:
- New utility: HAR export generation
- Update capture service to generate HAR
- Add export endpoints

**Required Features**:
- Generate HAR format from captured events
- Include session metadata
- Support on-demand export
- Automatic export on session end
- Tag with session ID and timestamps

---

## 🔧 Integration Points

### WebSocket Message Flow
```
Browser Capture Service
    ↓ (WebSocket: ws://localhost:8787/browser)
Bridge (/browser endpoint)
    ↓ (normalizes and broadcasts)
All Explorer Clients (Legacy + Neuromap)
    ↓ (useWebSocket hook)
Component State Updates
```

### Event Normalization
- Browser events → `MitmFlowEvent` with `source: 'browser'`
- Mobile events → `MitmFlowEvent` with `source: 'mobile'`
- Both types flow through same pipeline
- Endpoint deduplication works for both sources

### Action Correlation
- Actions sent separately via `browser_action` messages
- Frontend correlates using existing correlation engine
- Capture sessions provide baseline for better attribution

---

## 📋 Next Steps

1. **Update Launch Browser Endpoint** (Phase 4)
   - This is the critical integration point
   - Connects browser capture service to API endpoint
   - Enables browser launching from UI

2. **Enhanced Correlation** (Phase 5)
   - Use capture session baselines
   - Improve attribution accuracy

3. **UI Components** (Phase 6)
   - Build Browser View window
   - Create Signal Stream and Pipeline Sequence views
   - Integrate with existing Neuromap workspace

4. **Unified Store** (Phase 7)
   - Verify both modes receive browser events
   - Test synchronization
   - Ensure no duplication

5. **HAR Export** (Phase 8)
   - Implement HAR generation
   - Add export functionality

---

## 🧪 Testing Considerations

### Unit Tests Needed
- API-first decision engine logic
- Correlation with capture sessions
- Event normalization

### Integration Tests Needed
- Browser launch → capture → bridge → frontend flow
- Dual mode synchronization
- Step locking persistence

### Manual Testing
- Launch browser and interact
- Verify events appear in both modes
- Test step locking and export
- Verify API-first decisions are correct

---

## 📝 Notes

- **Size Limits**: Response bodies are capped at 100KB to prevent memory issues
- **Noise Filtering**: Basic filtering implemented; may need refinement
- **Storage Capture**: Not yet implemented (cookies/localStorage)
- **HAR Format**: Standard HAR 1.2 format should be used

---

**Last Updated**: 2025-01-XX
**Implementation Progress**: ~40% (Phases 1-3 complete, Phases 4-8 pending)
