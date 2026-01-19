# Network Inspector

A production-ready module for analyzing network request logs (HAR files) to identify important API endpoints and deduplicate requests.

## Features

- **HAR File Parsing**: Extracts network events from HAR files
- **Smart Deduplication**: Groups requests by normalized URL patterns
- **Importance Scoring**: Scores endpoints using non-keyword heuristics:
  - JSON responses
  - Authentication presence
  - Write methods (POST/PUT/PATCH/DELETE)
  - Response size and richness
  - User interaction correlation
  - Auth retry chain detection
- **Noise Detection**: Identifies polling loops and low-value endpoints
- **Comprehensive Reports**: Generates JSON and Markdown reports

## Installation

The module is part of the BrainScraper project. No additional installation required.

## Usage

### Basic Usage

```bash
npm run network-inspector -- --har ./capture.har --out ./output
```

### With Options

```bash
npm run network-inspector -- --har ./capture.har --out ./output --top 100 --phase-map ./phases.json
```

### Options

- `--har <path>`: Path to HAR file (required)
- `--out <path>`: Output directory for reports (required)
- `--top <number>`: Number of top endpoints to include in JSON report (default: 50)
- `--phase-map <path>`: Optional JSON file mapping time ranges to phases/action tags

### Phase Map Format

The phase map allows you to tag time ranges with phases and action tags:

```json
[
  {
    "start": 1000,
    "end": 5000,
    "phase": "page_load"
  },
  {
    "start": 5000,
    "end": 10000,
    "phase": "interaction",
    "actionTag": "clicked_search"
  }
]
```

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
- **+10**: Large successful response (≥2KB)
- **+10**: Rich JSON response (500B - 100KB)
- **+10**: User interaction phase
- **+10**: Auth retry chain participation
- **-15**: Polling-like pattern (tiny responses, high frequency)
- **-20**: OPTIONS requests or 204 responses (repeated)

## Testing

Run tests with:

```bash
npm test src/network-inspector
```

## Architecture

- `har.ts`: HAR file parsing
- `normalize.ts`: URL normalization and body fingerprinting
- `dedupe.ts`: Request deduplication and grouping
- `score.ts`: Importance scoring logic
- `report.ts`: Report generation
- `cli.ts`: Command-line interface
- `index.ts`: Main entry point

## License

Part of the BrainScraper project.
