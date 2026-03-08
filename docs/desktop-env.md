# Desktop (Electron) environment and API keys

**Last updated:** 2026-03-08

The Electron desktop app loads API keys and configuration from a `.env.local` file. It does **not** read from the project root at runtime when packaged; use one of the locations below.

## Env file search order

The main process looks for a `.env.local` file in this order (first found wins):

1. **`ELECTRON_ENV_FILE`** – If set, this exact path is used (e.g. for CI or custom installs).
2. **Next to the executable** – In a packaged app, `.env.local` in the same folder as the app binary (e.g. `Brainscraper.app/Contents/MacOS/` on macOS, or the folder containing the `.exe` on Windows).
3. **Project root (dev only)** – When running `npm run electron:dev`, the repo root (where `.env.local` already lives).
4. **User data directory** – Copy `.env.local` into the app’s user data folder (e.g. `~/Library/Application Support/brainscraper-desktop/.env.local` on macOS).

## Required / optional variables

Same as the web app. Commonly used:

| Variable | Required for | Notes |
|----------|--------------|--------|
| `RAPIDAPI_KEY` | LinkedIn/Facebook/Instagram scrapers, enrichment | RapidAPI subscription key |
| `TELNYX_API_KEY` | Phone validation (linetype, carrier) | Telnyx API key |
| `US_CENSUS_API_KEY` | Income-by-zip enrichment | Optional |
| `SITE_PASSWORD` | App login | Defaults if unset |
| `COGNITO_*` | Auth (if used) | User pool, client id, region, etc. |
| `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` | Background jobs | Optional in desktop; no public URL for webhooks |

Copy from the root `.env.example` and fill in values. For packaged builds, ship `env.example` (a copy of `.env.example`) so users know what to put in `.env.local` and where to place it.

## Data directory

The desktop app sets `DATA_DIR` to the app’s **user data directory** (e.g. `~/Library/Application Support/brainscraper-desktop/data` on macOS). All ingest, settings, and lead data live there. You do not need to set `DATA_DIR` yourself.

## Code signing (optional)

For distribution outside your machine, macOS and Windows typically require code signing. Configure signing in `electron/package.json` under `build.mac.identity` / `build.win.certificateFile` when ready; unsigned builds are fine for local use.
