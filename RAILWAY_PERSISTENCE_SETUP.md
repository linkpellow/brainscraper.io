# Railway Data Persistence Setup

## Overview
Lead data is stored in the `data/` directory. On Railway, this needs to be configured as a persistent volume so data survives deployments and restarts.

## Step 1: Add Persistent Volume in Railway

1. **Go to Railway Dashboard**
   - Open your `brainscraper.io` project
   - Click on your service

2. **Add Volume**
   - Click "New" → "Volume"
   - Name: `data-volume` (or any name)
   - Mount Path: `/data`
   - Click "Add"

3. **Set Environment Variable**
   - Go to your service → Variables
   - Add: `DATA_DIR=/data`
   - This tells the app to use the persistent volume instead of the ephemeral filesystem

## Step 2: Verify Data Persistence

After setting up the volume:

1. **Check logs** - You should see:
   ```
   📁 Created data directory: /data
   ```

2. **Test data persistence**:
   - Upload some leads via the UI
   - Check that files appear in `/data` (via Railway logs or shell)
   - Redeploy the service
   - Verify data still exists after redeploy

## What Gets Persisted

The following data is stored in the `data/` directory:

- **Lead Data:**
  - `enriched-*.json` - Enriched lead results
  - `api-results/*.json` - Raw API responses (timestamped)
  - `saved-leads.json` - Saved lead lists

- **Geo ID Database:**
  - `geo-id-database.json` - Location ID cache

- **DNC Data:**
  - `dnc-timestamp.json` - Last DNC check timestamp
  - DNC status is stored in enriched lead files

## Local Development

Locally, data is stored in `./data/` directory (relative to project root).

The `dataDirectory.ts` utility automatically:
- Uses `DATA_DIR` env var if set (Railway)
- Falls back to `./data/` for local development
- Creates directories automatically
- Handles errors gracefully

## Troubleshooting

**Data not persisting?**
- Verify `DATA_DIR=/data` is set in Railway environment variables
- Check that volume is mounted at `/data`
- Check Railway logs for directory creation messages

**Permission errors?**
- Railway volumes should have correct permissions automatically
- If issues occur, check volume mount path matches `DATA_DIR`
