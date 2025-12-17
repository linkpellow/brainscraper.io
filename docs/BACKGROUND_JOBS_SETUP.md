# Background Jobs Setup with Inngest

## Overview

BrainScraper.io now supports background processing for enrichment and LinkedIn scraping using **Inngest**, a modern serverless background job platform.

## Features

- ✅ **Non-blocking enrichment** - Enrich leads without blocking the UI
- ✅ **Background scraping** - Scrape LinkedIn leads in the background
- ✅ **Job status tracking** - Monitor job progress in real-time
- ✅ **Automatic retries** - Failed jobs automatically retry
- ✅ **Progress monitoring** - View job progress in the sidebar widget

## Setup Instructions

### 1. Create Inngest Account

1. Go to [https://www.inngest.com](https://www.inngest.com)
2. Sign up for a free account
3. Create a new app called "brainscraper-io"

### 2. Get Your Inngest Keys

1. In your Inngest dashboard, go to **Settings** → **Keys**
2. Copy your **Signing Key** (starts with `signkey-`)
3. Copy your **Event Key** (starts with `eventkey-`)

### 3. Configure Environment Variables

Add these to your `.env.local` file (or Railway environment variables):

```bash
# Inngest Configuration
INNGEST_EVENT_KEY=eventkey-your-key-here
INNGEST_SIGNING_KEY=signkey-your-key-here

# Optional: Base URL for background jobs (defaults to localhost:3000)
NEXT_PUBLIC_BASE_URL=https://your-domain.com
```

### 4. Deploy Inngest Dev Server (Local Development)

For local development, you need to run the Inngest Dev Server:

```bash
npx inngest-cli@latest dev
```

This will:
- Start a local Inngest server
- Provide a dashboard at `http://localhost:8288`
- Sync your functions automatically

### 5. Production Deployment

For production (Railway), Inngest will automatically discover your functions via the `/api/inngest` endpoint.

**No additional configuration needed!** Inngest will:
- Automatically sync your functions
- Handle webhooks
- Provide a production dashboard

## Usage

### Starting Background Enrichment

1. Scrape leads using the LinkedIn scraper
2. Click the **"Background"** button next to "Enrich & Scrub"
3. The job will start in the background
4. Monitor progress in the **Background Jobs** widget in the sidebar

### Starting Background Scraping

Background scraping can be triggered via API:

```typescript
POST /api/jobs/scrape
{
  "searchParams": { /* LinkedIn search parameters */ },
  "maxPages": 10,
  "maxResults": 250
}
```

### Checking Job Status

```typescript
GET /api/jobs/status?jobId=your-job-id
GET /api/jobs/status?activeOnly=true
GET /api/jobs/status?limit=50
```

## Architecture

```
User Action
    ↓
API Route (/api/jobs/enrich or /api/jobs/scrape)
    ↓
Inngest Event
    ↓
Background Function (runs on Inngest servers)
    ↓
Job Status Updates (saved to disk)
    ↓
Frontend Polls Status (via /api/jobs/status)
```

## File Structure

```
utils/
  inngest.ts              # Inngest client configuration
  inngest/
    enrichment.ts         # Enrichment background functions
    scraping.ts           # Scraping background functions
  jobStatus.ts            # Job status tracking utilities

app/
  api/
    inngest/route.ts      # Inngest webhook handler
    jobs/
      enrich/route.ts     # Trigger enrichment job
      scrape/route.ts     # Trigger scraping job
      status/route.ts     # Check job status

app/components/
  BackgroundJobs.tsx     # UI widget for monitoring jobs
```

## Job Status Storage

Job statuses are stored in:
- **Local**: `./data/jobs/*.json`
- **Railway**: `/data/jobs/*.json` (persistent volume)

Each job file contains:
- Job ID
- Status (pending/running/completed/failed)
- Progress (current/total/percentage)
- Timestamps
- Metadata
- Error messages (if failed)

## Monitoring

### Inngest Dashboard

- **Local**: `http://localhost:8288`
- **Production**: Your Inngest dashboard URL

View:
- All function runs
- Success/failure rates
- Execution logs
- Retry attempts

### Sidebar Widget

The **Background Jobs** widget in the sidebar shows:
- Active jobs (pending/running)
- Progress bars
- Status indicators
- Error messages

## Troubleshooting

### Jobs Not Starting

1. Check Inngest Dev Server is running (local)
2. Verify environment variables are set
3. Check `/api/inngest` endpoint is accessible
4. Review Inngest dashboard for errors

### Jobs Stuck in "Pending"

1. Check Inngest dashboard for function sync status
2. Verify the function is registered correctly
3. Check server logs for errors

### Progress Not Updating

1. Verify job status files are being written to disk
2. Check file permissions on Railway
3. Ensure `DATA_DIR` is set correctly

## Best Practices

1. **Use background jobs for**:
   - Large batch operations (100+ leads)
   - Long-running processes
   - When you want to continue working

2. **Use synchronous processing for**:
   - Small batches (< 10 leads)
   - When you need immediate results
   - Testing/debugging

3. **Monitor job status**:
   - Check the sidebar widget regularly
   - Review Inngest dashboard for failures
   - Set up alerts for failed jobs (future feature)

## Cost

- **Inngest Free Tier**: 25,000 function runs/month
- **Perfect for**: Most use cases
- **Upgrade needed**: Only for very high volume

## Support

- Inngest Docs: https://www.inngest.com/docs
- Inngest Discord: https://www.inngest.com/discord
