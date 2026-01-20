# Mode #1: Full Map API Routes

**Version**: 2.0.0  
**Purpose**: Map legacy form-based applications to automated API workflows

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Endpoints](#endpoints)
3. [Request/Response Schemas](#schemas)
4. [Usage Examples](#examples)
5. [Error Handling](#errors)
6. [Best Practices](#best-practices)

---

## 🎯 Overview

The Full Map API provides endpoints for:
- Generating button maps (correlating UI elements → network requests)
- Validating workflows sequentially (2x success requirement)
- Persisting results for historical tracking
- Retrieving previous analyses

---

## 🔌 Endpoints

### 1. Generate Button Map

**POST** `/api/fullmap/generate-button-map`

Analyzes DOM snapshots and network events to create a complete button → endpoint correlation map.

**Request Body**:
```typescript
{
  sessionId: string;           // Flipbook session ID
  networkEvents: Array<{       // Captured network traffic
    ts: number;
    method: string;
    url: string;
    path: string;
    reqBodyText?: string;
    reqHeaders?: Record<string, string>;
  }>;
}
```

**Response**:
```typescript
{
  ok: true;
  buttonMap: {
    totalButtons: number;
    mappedButtons: number;
    unmappedButtons: number;
    coverage: number;           // 0-1 percentage
    buttons: Array<{
      id: string;
      type: string;
      text?: string;
      endpoint?: string;
      method?: string;
      confidence?: number;
      formState?: FormState;
      xpath?: string;
    }>;
    generatedAt: number;
    snapshotsAnalyzed: number;
    networkEventsAnalyzed: number;
  };
}
```

**Usage**:
```typescript
const response = await fetch('/api/fullmap/generate-button-map', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sessionId: 'session-123',
    networkEvents: capturedEvents
  })
});

const { buttonMap } = await response.json();
console.log(`Mapped ${buttonMap.mappedButtons}/${buttonMap.totalButtons} buttons`);
```

---

### 2. Retrieve Button Map

**GET** `/api/fullmap/generate-button-map?sessionId={sessionId}`

Retrieves a previously generated button map from disk.

**Query Parameters**:
- `sessionId` (required): Session ID to retrieve

**Response**: Same as POST response above

**Usage**:
```typescript
const response = await fetch(`/api/fullmap/generate-button-map?sessionId=session-123`);
const { buttonMap } = await response.json();
```

---

### 3. Validate Workflow

**POST** `/api/fullmap/validate-workflow`

Validates a complete workflow by running it multiple times in sequence.

**Request Body**:
```typescript
{
  steps: LockedStep[];         // Array of workflow steps
  mode: 'sequential' | 'persistence'; // Validation mode
  numAttempts?: number;        // Default: 2
  delayMs?: number;            // For persistence mode (default: 5000)
  sessionId?: string;          // Optional, for persistence
}
```

**LockedStep Type**:
```typescript
{
  id: string;
  stepNumber: number;
  endpoint: string;
  method: string;
  payload?: any;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
  extractedVars: Record<string, any>;
  dependencies: string[];
  expectedStatus?: number;
  expectedResult?: string;
  formState?: {
    viewstate?: string;
    viewstateGenerator?: string;
    eventValidation?: string;
    eventTarget?: string;
    eventArgument?: string;
    customFields?: Record<string, string>;
  };
}
```

**Response**:
```typescript
{
  ok: true;
  result: {
    allPassed: boolean;
    totalAttempts: number;
    successfulAttempts: number;
    failedAttempts: number;
    steps: Array<{
      stepNumber: number;
      passRate: number;
      attempts: Array<{
        success: boolean;
        statusCode?: number;
        responseTime: number;
        error?: string;
        formStateUpdated?: boolean;
      }>;
    }>;
    averageResponseTime: number;
    reliability: number;        // 0-1
  };
}
```

**Usage**:
```typescript
// Sequential validation (2x back-to-back)
const response = await fetch('/api/fullmap/validate-workflow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    steps: lockedSteps,
    mode: 'sequential',
    numAttempts: 2,
    sessionId: 'session-123'
  })
});

const { result } = await response.json();
if (result.allPassed) {
  console.log(`✅ Workflow validated: ${result.reliability * 100}% reliable`);
}

// Persistence validation (with delays)
const response2 = await fetch('/api/fullmap/validate-workflow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    steps: lockedSteps,
    mode: 'persistence',
    numAttempts: 3,
    delayMs: 5000,  // 5 second delay between attempts
    sessionId: 'session-123'
  })
});
```

---

### 4. Retrieve Validation History

**GET** `/api/fullmap/validate-workflow?sessionId={sessionId}`

Retrieves all validation runs for a specific session.

**Response**:
```typescript
{
  ok: true;
  validations: Array<{
    sessionId: string;
    mode: 'sequential' | 'persistence';
    numAttempts: number;
    delayMs?: number;
    timestamp: number;
    result: SequentialTestResult;
    steps: Array<{
      stepNumber: number;
      endpoint: string;
      method: string;
    }>;
  }>;
  count: number;
}
```

---

## 🔍 Request/Response Schemas

### FormState
```typescript
{
  viewstate?: string;               // ASP.NET __VIEWSTATE
  viewstateGenerator?: string;      // ASP.NET __VIEWSTATEGENERATOR
  eventValidation?: string;         // ASP.NET __EVENTVALIDATION
  eventTarget?: string;             // ASP.NET __EVENTTARGET
  eventArgument?: string;           // ASP.NET __EVENTARGUMENT
  customFields: Record<string, string>; // Other hidden fields
}
```

### ButtonMapResult
```typescript
{
  totalButtons: number;            // Total interactive elements found
  mappedButtons: number;           // Successfully mapped to endpoints
  unmappedButtons: number;         // No endpoint correlation found
  coverage: number;                // 0-1 percentage mapped
  buttons: MappedElement[];        // Array of mapped elements
  generatedAt: number;             // Unix timestamp
  snapshotsAnalyzed: number;       // Number of DOM snapshots used
  networkEventsAnalyzed: number;   // Number of network events used
}
```

---

## 💡 Usage Examples

### Complete Workflow

```typescript
// 1. Capture DOM snapshots (via browser interaction)
// → Automatic via dom-flipbook-inject.js

// 2. Generate button map
const mapResponse = await fetch('/api/fullmap/generate-button-map', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sessionId: flipbookSessionId,
    networkEvents: capturedNetworkTraffic
  })
});

const { buttonMap } = await mapResponse.json();

// 3. User locks steps via UI
// → lockedSteps array populated

// 4. Validate workflow
const validateResponse = await fetch('/api/fullmap/validate-workflow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    steps: lockedSteps,
    mode: 'sequential',
    numAttempts: 2,
    sessionId: flipbookSessionId
  })
});

const { result } = await validateResponse.json();

if (result.allPassed && result.reliability === 1.0) {
  console.log('✅ Workflow ready for automation!');
  // Export workflow
}
```

---

## ⚠️ Error Handling

All endpoints return errors in a consistent format:

```typescript
{
  ok: false;
  error: string;  // Human-readable error message
}
```

### Common Error Codes:

| Code | Meaning | Solution |
|------|---------|----------|
| 400 | Bad Request | Check required parameters |
| 404 | Not Found | Session ID invalid or expired |
| 500 | Server Error | Check server logs, retry |

### Error Examples:

**Missing sessionId**:
```json
{
  "ok": false,
  "error": "Missing sessionId"
}
```

**No snapshots found**:
```json
{
  "ok": false,
  "error": "No snapshots found for this session"
}
```

**Validation failed**:
```json
{
  "ok": false,
  "error": "Step 2 failed: 401 Unauthorized"
}
```

---

## 🎓 Best Practices

### 1. **Session Management**
- Use consistent `sessionId` across all requests
- Sessions are isolated - one per workflow
- Clean up old sessions after export

### 2. **Button Map Generation**
- Generate **after** capturing sufficient interactions
- Aim for >80% coverage before validation
- Re-generate if you add new interactions

### 3. **Workflow Validation**
- Always validate **2x minimum** for Mode #1
- Use `persistence` mode to test cookie longevity
- Fix all failures before export

### 4. **Error Recovery**
- Check error messages for actionable solutions
- Retry with exponential backoff for network errors
- Re-authenticate if you see 401 errors

### 5. **Performance**
- Batch network events (don't send one at a time)
- Use GET to retrieve existing maps (avoid regeneration)
- Clean up sessions after successful export

---

## 🔐 Security Considerations

- **Form State**: Contains sensitive session tokens - never expose client-side
- **Validation**: Runs actual HTTP requests - rate limit if needed
- **Persistence**: Files stored in `data/` - ensure proper permissions
- **Sessions**: Isolated by ID - prevent cross-session leakage

---

## 📞 Support

For issues or questions:
1. Check error messages (they include solutions)
2. Review validation history for patterns
3. Check server logs for detailed stack traces
4. Consult [MODE_1_ENHANCEMENTS.md](../../docs/MODE_1_ENHANCEMENTS.md)

---

**Last Updated**: 2026-01-20  
**Maintained By**: API Signal Explorer Team  
**License**: Proprietary
