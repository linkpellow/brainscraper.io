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

## WARN and Scrapegraph

- **Single backend:** Scrapegraph is integrated into BrainScraper. Use **WARN Lists** in the app: upload CSV/Excel or use **Scrape from URL** to scrape a WARN page (runs Scrapegraph via subprocess; requires Ollama with phi3:mini when using default model). No separate Streamlit app or port 8501.

## Inngest (background jobs)

- **Keys in Railway:** `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` are required to send events.
- **Sync required:** Keys alone are not enough. Inngest must know your app URL. In Inngest Cloud → Apps → Sync App, paste `https://<your-railway-domain>/api/inngest`. Without this, jobs stay pending. See [docs/inngest-railway-sync.md](inngest-railway-sync.md).
- **Resync after deploy:** When you change Inngest functions, resync the app (or `curl -X PUT https://<your-app>/api/inngest`).

## Node version

- `package.json` `engines`: supports Node 20.x; broader range (e.g. `>=20.19.0`) can be set if you standardize on Node 22+.
- Railway: set `NODE_VERSION=20` in env for predictable builds.
