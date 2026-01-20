# 📖 DOM Flip Book System

## Complete Website Mapping for AI Analysis

The DOM Flip Book system captures the **entire DOM structure** of every page you visit, not just what's visible on screen. It creates a comprehensive "flip book" of snapshots that the AI can analyze to understand navigation patterns, page structure, and optimal data extraction strategies.

---

## 🎯 What Problem Does This Solve?

### Before DOM Flip Book:
- ❌ AI only saw API traffic (network requests/responses)
- ❌ No understanding of page structure or layout
- ❌ Couldn't detect pagination patterns
- ❌ No visual/DOM context for automation
- ❌ Manual Playwright code writing required

### After DOM Flip Book:
- ✅ AI sees **complete DOM structure** (entire page, not just viewport)
- ✅ Understands navigation and pagination patterns
- ✅ Auto-detects "Next" buttons and infinite scroll
- ✅ Generates Playwright automation code automatically
- ✅ Maps entire websites for comprehensive scraping

---

## 🔧 How It Works

### 1. Automatic Capture

When you browse a target site in the Electron browser, the Flip Book system:

1. **Captures on Page Load** - Initial snapshot after DOM settles (1s delay)
2. **Tracks Changes** - MutationObserver watches for DOM modifications
3. **Triggers on Threshold** - Creates snapshot after 50+ mutations
4. **Scroll Detection** - Captures when user scrolls significantly
5. **Auto-Pagination** - Detects and clicks "Next"/"Load More" buttons
6. **Infinite Scroll** - Auto-scrolls to trigger lazy-loaded content

### 2. Full DOM Snapshot

Each snapshot captures:

```typescript
{
  id: "snap-1234567890-abc123",
  url: "https://example.com/products",
  timestamp: 1234567890000,
  
  scrollPosition: { x: 0, y: 1200 },
  viewport: { width: 1920, height: 1080 },
  document: { width: 1920, height: 5400 }, // Full page height
  
  title: "Products - Example Store",
  
  html: "<html>...</html>", // Complete HTML
  
  dom: {
    tag: "div",
    id: "product-list",
    classes: ["container", "grid"],
    attributes: { "data-testid": "product-grid" },
    position: {
      x: 100,
      y: 500,
      width: 1720,
      height: 4000,
      visible: true,
      inViewport: false // Most of it is below fold
    },
    style: {
      display: "grid",
      visibility: "visible",
      opacity: "1"
    },
    text: "",
    children: [...] // Recursive tree
  },
  
  metadata: {
    contentItems: [
      { selector: ".product", index: 0, text: "Product 1...", visible: true },
      { selector: ".product", index: 1, text: "Product 2...", visible: false }
      // ... 48 more products (even those below fold)
    ],
    pagination: [
      { type: "a", text: "Next", href: "/page/2", clickable: true }
    ],
    navigation: [...],
    forms: [...],
    lists: [...],
    mediaCount: { images: 50, videos: 2, iframes: 0 },
    hasInfiniteScroll: false
  },
  
  changes: 127 // Mutations since last snapshot
}
```

### 3. Smart Pagination Detection

The system automatically detects pagination using multiple patterns:

```javascript
// Detects these patterns:
'a[rel="next"]'
'a:contains("Next")'
'button:contains("Next")'
'button:contains("Load More")'
'.pagination a:not(.active)'
'[aria-label*="next"]'
'[data-testid*="next"]'
// ... and more
```

When detected, it:
1. Captures current page state
2. Waits 500-1500ms (human-like delay)
3. Auto-clicks the pagination button
4. Captures next page state
5. Repeats up to 20 times (configurable)

### 4. Infinite Scroll Handling

For infinite scroll sites:

1. Detects when user scrolls to 80% of page
2. Waits 500ms for content to load
3. Captures new DOM state
4. Continues scrolling automatically
5. Stops after 20 iterations or no new content

---

## 🤖 AI Analysis

### Triggering Analysis

In the UI, click the **"Flipbook (N)"** button (where N = number of snapshots):

```
CAPTURE • NETWORK TRAFFIC
[Plan Workflow] [Flipbook (5)] [✓ Smart Filter]
```

### What AI Analyzes

The AI examines all snapshots to determine:

1. **Navigation Pattern**
   - Type: pagination | infinite scroll | manual
   - Details: How to navigate between pages
   - Selectors: CSS/XPath for navigation elements

2. **Content Structure**
   - Where target data is located
   - CSS selectors for data fields
   - Patterns across pages

3. **Workflow Steps**
   - Sequential actions needed
   - Wait conditions
   - Dependencies between steps

4. **Playwright Code**
   - Complete automation script
   - Handles navigation
   - Extracts data
   - Deals with edge cases

5. **Data Extraction**
   - Precise CSS selectors
   - XPath expressions
   - Field mappings

6. **Edge Cases**
   - Lazy loading detection
   - Rate limit indicators
   - Authentication requirements

### AI Response Example

```json
{
  "navigationPattern": {
    "type": "pagination",
    "details": "Standard pagination with 'Next' button at bottom"
  },
  "contentStructure": {
    "selector": ".product-card",
    "dataFields": ["title", "price", "rating", "url"]
  },
  "workflowSteps": [
    {
      "step": 1,
      "action": "Navigate to products page",
      "selector": null,
      "wait": "networkidle"
    },
    {
      "step": 2,
      "action": "Extract product data",
      "selector": ".product-card",
      "wait": "selector"
    },
    {
      "step": 3,
      "action": "Click next button",
      "selector": "a[rel='next']",
      "wait": "navigation"
    }
  ],
  "playwrightCode": "...",
  "dataExtraction": {
    "selectors": {
      "title": ".product-card h3",
      "price": ".product-card .price",
      "rating": ".product-card .rating"
    }
  },
  "edgeCases": [
    "Rate limit: max 10 requests/second",
    "Images lazy load on scroll",
    "Last page has no 'Next' button"
  ],
  "confidence": 95
}
```

---

## 📊 Storage

### File Structure

```
data/
  dom-snapshots/
    session-1234567890-abc123/
      snap-1234567890-abc123.json    # Full snapshot
      snap-1234567891-def456.json
      snap-1234567892-ghi789.json
      _index.json                     # Lightweight index
```

### Index Format

```json
[
  {
    "id": "snap-1234567890-abc123",
    "url": "https://example.com/products",
    "timestamp": 1234567890000,
    "title": "Products - Example Store",
    "contentCount": 50,
    "paginationCount": 1,
    "changes": 127,
    "filepath": "/path/to/snapshot.json"
  }
]
```

---

## 🎮 Usage Workflow

### Step 1: Define Goal
```
User: "Get all product names and prices"
AI: "✓ Goal locked"
```

### Step 2: Browse Target Site
```
User: [Launches browser, navigates to products page]
AI: "✅ Traffic captured! 47 endpoints detected"
```

### Step 3: Trigger Flipbook Analysis
```
User: [Clicks "Flipbook (5)" button]
AI: "🔍 Analyzing 5 DOM snapshots...

     This will help me understand:
     • Page structure and navigation patterns
     • Where your target data is located
     • Optimal automation workflow
     • Playwright code for seamless navigation"
```

### Step 4: Review Results
```
AI: "✅ DOM Analysis Complete

     Navigation: pagination
     Standard pagination with 'Next' button at bottom
     
     Content Located: .product-card
     
     Workflow Steps (3):
     1. Navigate to products page
     2. Extract product data
     3. Click next button
     
     Confidence: 95%
     
     Playwright Code Generated ✓
     
     I can now:
     • Auto-navigate through pages
     • Extract data with precise selectors
     • Handle pagination automatically"
```

### Step 5: Export Workflow
```
User: [Clicks "Export Workflow"]
AI: [Downloads JSON with Playwright code + selectors]
```

---

## ⚙️ Configuration

Edit `/desktop/dom-flipbook-inject.js`:

```javascript
const CONFIG = {
  captureInterval: 2000,        // Min ms between snapshots
  changeThreshold: 50,          // Min mutations to trigger snapshot
  maxSnapshotsPerPage: 100,     // Max snapshots per URL
  
  scrollThreshold: 0.8,         // Trigger at 80% scroll
  scrollDebounce: 500,          // ms to wait after scroll
  maxAutoScroll: 20,            // Max auto-scroll iterations
  
  maxDomSize: 10 * 1024 * 1024, // 10MB max per snapshot
};
```

---

## 🚀 Performance Optimizations

### Capture Throttling
- Minimum 2s between snapshots
- Debounced scroll events (500ms)
- Mutation batching (50+ changes)

### Size Limits
- Max snapshot: 10MB
- Max DOM depth: 50 levels
- Max children per element: 1000
- Text truncation: 200 chars

### Smart Filtering
- Only visible elements detailed
- Off-screen elements simplified
- Computed styles only for positioned elements

---

## 🔌 API Endpoints

### Store Snapshot
```http
POST /api/flipbook/store
Content-Type: application/json

{
  "snapshot": { ... },
  "sessionId": "session-123"
}

Response:
{
  "ok": true,
  "snapshotId": "snap-123",
  "filepath": "/path/to/snap-123.json"
}
```

### List Snapshots
```http
GET /api/flipbook/store?sessionId=session-123

Response:
{
  "ok": true,
  "sessionId": "session-123",
  "snapshots": [...],
  "count": 5
}
```

### Retrieve Snapshot
```http
GET /api/flipbook/retrieve?snapshotId=snap-123&sessionId=session-123

Response:
{
  "ok": true,
  "snapshot": { ... }
}
```

### List Sessions
```http
GET /api/flipbook/sessions

Response:
{
  "ok": true,
  "sessions": [
    {
      "sessionId": "session-123",
      "snapshotCount": 5,
      "path": "/path/to/session"
    }
  ]
}
```

### AI Analysis
```http
POST /api/ai/analyze-dom-flipbook
Content-Type: application/json

{
  "sessionId": "session-123",
  "goal": "Get all products",
  "targetData": "{ name, price }"
}

Response:
{
  "ok": true,
  "analysis": {
    "navigationPattern": { ... },
    "contentStructure": { ... },
    "workflowSteps": [ ... ],
    "playwrightCode": "...",
    "dataExtraction": { ... },
    "edgeCases": [ ... ],
    "confidence": 95
  },
  "snapshotsAnalyzed": 5,
  "tokensUsed": 3500
}
```

---

## 🎯 Use Cases

### E-commerce Scraping
- Capture product listings across multiple pages
- Auto-navigate through pagination
- Extract prices, ratings, reviews
- Handle lazy-loaded images

### Job Board Monitoring
- Scrape all job postings
- Track changes over time
- Auto-click "Load More"
- Extract structured data

### News Aggregation
- Capture article listings
- Navigate through categories
- Handle infinite scroll
- Extract headlines and summaries

### Real Estate Listings
- Scrape property listings
- Auto-paginate through results
- Extract prices, locations, features
- Handle map-based interfaces

---

## 🐛 Troubleshooting

### No Snapshots Captured
- Check browser console for errors
- Ensure DOM has settled (wait 1-2s after navigation)
- Verify `dom-flipbook-inject.js` is loaded
- Check mutation threshold (lower if needed)

### Pagination Not Detected
- Add custom selectors to `paginationSelectors` array
- Verify pagination elements are visible
- Check for SPA-style navigation (may need different approach)

### Snapshots Too Large
- Reduce `maxDomSize` limit
- Increase `maxDepth` limit (capture less deep)
- Filter out unnecessary elements

### AI Analysis Fails
- Ensure OpenAI API key is set
- Check snapshot count (needs 1-5 snapshots)
- Verify goal and target data are clear
- Check API logs for errors

---

## 🔬 Advanced: Manual Control

Access the Flip Book API from browser console:

```javascript
// Trigger manual capture
window.__domFlipbook.capture();

// Get all snapshots
const snapshots = window.__domFlipbook.getSnapshots();
console.log(snapshots);

// Get current state
const state = window.__domFlipbook.getState();
console.log(state);

// Access config
const config = window.__domFlipbook.config;
config.maxAutoScroll = 50; // Increase auto-scroll limit
```

---

## 🎓 Best Practices

1. **Let Pages Settle** - Wait 1-2s after navigation before analyzing
2. **Clear Goal** - Define precise data extraction goals before browsing
3. **Scroll Naturally** - Scroll through pages to trigger lazy loading
4. **Analyze After Browsing** - Capture 3-5 pages before running AI analysis
5. **Review AI Output** - Verify Playwright code matches expected behavior
6. **Export Workflows** - Save successful workflows for reuse

---

## 📚 Related Documentation

- [Straight Line AI Agent](./STRAIGHT_LINE_AI_AGENT.md) - AI decision-making framework
- [API Signal Explorer Setup](./API_SIGNAL_EXPLORER_SETUP.md) - System configuration
- [Anti-Bot Audit](./ANTI_BOT_AUDIT.md) - Stealth automation techniques

---

## 🎉 Summary

The DOM Flip Book system gives the AI **complete vision** of websites:

| Feature | Coverage |
|---------|----------|
| **Visible Elements** | ✅ Yes |
| **Off-screen Elements** | ✅ Yes |
| **Hidden Elements** | ✅ Yes |
| **Shadow DOM** | ✅ Yes |
| **Lazy-loaded Content** | ✅ Yes (via auto-scroll) |
| **Pagination** | ✅ Yes (auto-detect + click) |
| **Infinite Scroll** | ✅ Yes (auto-scroll) |
| **Element Positioning** | ✅ Yes (computed styles) |
| **Change Detection** | ✅ Yes (MutationObserver) |
| **AI Analysis** | ✅ Yes (GPT-4) |
| **Playwright Generation** | ✅ Yes |

**Result:** The AI can now see, understand, and automate **any** website.
