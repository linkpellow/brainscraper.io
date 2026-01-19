# Network Inspector

A production-ready module for analyzing network request logs (HAR files) to identify important API endpoints and deduplicate requests.

## Features

- **HAR File Parsing**: Extracts network events from HAR files
- **Smart Deduplication**: Groups requests by normalized URL patterns
- **Automatic Phase Detection**: Classifies requests by lifecycle phase:
  - `page_load`: Requests within 4 seconds of session start
  - `interaction`: Requests during user action windows
  - `background`: All other requests
- **User-Action Correlation**: Maps requests to specific user actions via action windows
- **Importance Scoring**: Scores endpoints using non-keyword heuristics:
  - JSON responses (+25)
  - Authentication presence (+20)
  - Write methods (POST/PUT/PATCH/DELETE) (+15)
  - Interaction phase requests (+15)
  - User-action tagged requests (+5)
  - Response size and richness (+10 each)
  - Auth retry chain detection (+10)
  - Background polling patterns (-20)
  - Polling loop detection (-10)
- **Noise Detection**: Identifies polling loops and low-value endpoints
- **Comprehensive Reports**: Generates JSON and Markdown reports with phase analysis

## Installation

The module is part of the BrainScraper project. No additional installation required.

## Usage

### Basic Usage

```bash
npm run network-inspector -- --har ./capture.har --out ./output
```

### With Options

```bash
npm run network-inspector -- --har ./capture.har --out ./output --top 100 --actions ./actions.json
```

### Options

- `--har <path>`: Path to HAR file (required)
- `--out <path>`: Output directory for reports (required)
- `--top <number>`: Number of top endpoints to include in JSON report (default: 50)
- `--actions <path>`: Optional JSON file with action windows for user-action correlation
- `--phase-map <path>`: Optional legacy phase mapping file (deprecated, use --actions instead)

### Action Windows Format

The action windows file allows you to define user actions and their time ranges:

```json
{
  "sessionStartTs": 1700000000000,
  "actions": [
    {
      "label": "search_click",
      "startTs": 1700000004500,
      "endTs": 1700000007000
    },
    {
      "label": "submit_form",
      "startTs": 1700000008000,
      "endTs": 1700000010000
    }
  ]
}
```

**Phase Classification Rules:**
- If event timestamp falls within any action window → `interaction` phase
- Else if event timestamp ≤ sessionStartTs + 4000ms → `page_load` phase
- Else → `background` phase

**Without action windows:** The system still classifies requests automatically:
- First 4 seconds after session start → `page_load`
- Everything else → `background`

## Generating HAR Files

### From Chrome DevTools

1. Open Chrome DevTools (F12)
2. Go to the **Network** tab
3. Navigate to your application or perform actions
4. Right-click in the network log
5. Select **Save all as HAR with content**
6. Save the file (e.g., `capture.har`)

### From Playwright

```typescript
import { chromium } from 'playwright';

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

// Enable HAR recording
await context.route('**/*', (route) => route.continue());

// Navigate and interact
await page.goto('https://example.com');
// ... perform actions ...

// Save HAR
const har = await context.request.storageState();
// Export to HAR format (requires additional processing)
```

## Output Files

### `important_endpoints.json`

JSON report containing:
- Total endpoints count
- Top N endpoints sorted by score
- Full endpoint details including:
  - Method, host, path
  - Request count
  - Status code distribution
  - Response MIME types
  - Average response size
  - Importance score and reasons

### `network_dedupe_report.md`

Markdown report containing:
- Summary statistics
- Top important endpoints (detailed)
- Top noise endpoints
- Potential polling loops

## Example Output

### JSON Report

```json
{
  "generated": "2026-01-19T12:00:00.000Z",
  "totalEndpoints": 150,
  "topEndpoints": [
    {
      "key": "POST api.example.com/auth/login",
      "method": "POST",
      "host": "api.example.com",
      "path": "/auth/login",
      "count": 1,
      "score": 70,
      "reasons": [
        "JSON response",
        "Authentication present",
        "Write method"
      ],
      "statuses": {
        "200": 1
      },
      "resMimeTop": "application/json",
      "resSizeAvg": 2048
    }
  ]
}
```

### Markdown Report

```markdown
# Network Deduplication Report

## Summary

- **Total Requests:** 500
- **Unique Endpoints:** 150
- **High-Importance Endpoints (score > 0):** 45

## Top Important Endpoints

### POST api.example.com/auth/login
- **Score:** 70/100
- **Count:** 1
- **Reasons:** JSON response, Authentication present, Write method
- **Status Codes:** 200 (1)
- **Content-Type:** application/json
- **Avg Response Size:** 2 KB
```

## Scoring Heuristics

The importance score (0-100) is calculated using:

- **+25**: JSON response
- **+20**: Authentication present (headers, cookies, CSRF tokens)
- **+15**: Write method (POST/PUT/PATCH/DELETE)
- **+15**: Interaction phase request
- **+10**: Large successful response (≥2KB)
- **+10**: Rich JSON response (500B - 100KB)
- **+10**: Auth retry chain participation
- **+5**: User-action tagged request
- **-20**: Background polling pattern (background phase + ≥5 requests)
- **-15**: Polling-like pattern (tiny responses, high frequency)
- **-10**: Detected polling loop
- **-20**: OPTIONS requests or 204 responses (repeated)

## Testing

Run tests with:

```bash
npm test src/network-inspector
```

## Architecture

- `har.ts`: HAR file parsing with phase detection
- `phase.ts`: Phase classification and polling loop detection
- `normalize.ts`: URL normalization and body fingerprinting
- `dedupe.ts`: Request deduplication and grouping
- `score.ts`: Phase-aware importance scoring logic
- `report.ts`: Report generation with phase analysis
- `cli.ts`: Command-line interface
- `index.ts`: Main entry point

## License

Part of the BrainScraper project.
