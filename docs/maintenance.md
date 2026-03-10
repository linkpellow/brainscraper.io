# Maintenance and runbook

**Last updated:** 2026-03-08

## How to run

| Context | Command | Notes |
|--------|--------|------|
| **Development** | `npm run dev` | Next.js dev server. |
| **Production (web)** | `npm start` | Custom server (`node server.js`). Use after `npm run build`. |
| **Production (standalone)** | `npm run start:next` | Runs `node .next/standalone/server.js`. Use only after `npm run build`; do **not** use `next start` when `output: 'standalone'` is set. |
| **Electron** | `npm run electron:dev` | Builds, copies standalone, then starts Electron. |

## Deployment (Railway)

- **Build:** `npm run build`
- **Start:** `npm start` (custom server)
- Set `NODE_VERSION=20` in Railway if you need to match `engines`; otherwise Node 20 LTS is recommended.
- For production installs (if you ever run install in deploy): use `npm install --omit=dev`, not `--production` (deprecated).

## Dependencies

### baseline-browser-mapping

Used for up-to-date browser baseline data. Data can go stale after a couple of months.

- **Update:** `npm i baseline-browser-mapping@latest -D`
- **Pin:** Keep a specific or caret range in `package.json`; update periodically and run tests.

## WARN scraping

- Use **WARN Lists** in the app:
  - Upload CSV/Excel files to `/api/warn/ingest`, or
  - Use **Scrape from URL** in `/warn`, which runs a Node-based parser through `/api/warn/scrape`.
- No Python or Ollama runtime is required.

## External scraper handoff (enrichment API)

Use this flow when scraping leads externally and enriching in BrainScraper:

1. Start enrichment:
   - `POST /api/jobs/enrich`
   - Body shape:
     - `parsedData.headers`: string[]
     - `parsedData.rows`: object[]
     - optional `metadata`, optional `enabledStations`, optional `sync`
2. Poll job status:
   - `GET /api/jobs/status?jobId=<jobId>`
3. Get completed results:
   - `GET /api/jobs/results?jobId=<jobId>`

Example:

```bash
curl -X POST "https://<your-domain>/api/jobs/enrich" \
  -H "Content-Type: application/json" \
  -d '{
    "sync": true,
    "enabledStations": ["linkedin"],
    "parsedData": {
      "headers": ["Name", "City", "State", "LinkedIn URL"],
      "rows": [
        {
          "Name": "Jane Doe",
          "City": "Austin",
          "State": "TX",
          "LinkedIn URL": "https://www.linkedin.com/in/janedoe"
        }
      ]
    },
    "metadata": {
      "source": "external-scraper"
    }
  }'
```

## Inngest (background jobs)

- **Keys in Railway:** `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` are required to send events.
- **Sync required:** Keys alone are not enough. Inngest must know your app URL. In Inngest Cloud → Apps → Sync App, paste `https://<your-railway-domain>/api/inngest`. Without this, jobs stay pending. See [docs/inngest-railway-sync.md](inngest-railway-sync.md).
- **Resync after deploy:** When you change Inngest functions, resync the app (or `curl -X PUT https://<your-app>/api/inngest`).

## Node version

- `package.json` `engines`: supports Node 20.x; broader range (e.g. `>=20.19.0`) can be set if you standardize on Node 22+.
- Railway: set `NODE_VERSION=20` in env for predictable builds.
