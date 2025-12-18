# Railway Deployment Guide

This guide will help you deploy brainscraper.io to Railway with persistent data storage.

## Prerequisites

1. Railway account (sign up at https://railway.app)
2. GitHub repository (or connect directly)
3. Custom domain (optional)

## Step 1: Create Railway Project

1. Go to https://railway.app
2. Click "New Project"
3. Select "Deploy from GitHub repo" (or "Empty Project" to connect later)
4. Choose your `brainscraper.io` repository

## Step 2: Configure Persistent Volume

1. In your Railway project, click "New" → "Volume"
2. Name it `data-storage`
3. Mount path: `/data`
4. This will store all your `data/*.json` files persistently

## Step 3: Set Environment Variables

In Railway project settings → Variables, add:

```
DATA_DIR=/data
NODE_ENV=production
```

Optional (for cron security):
```
CRON_SECRET=your-random-secret-here
```

## Step 4: Configure Cron Job

1. In Railway project, click "New" → "Cron"
2. Schedule: `0 6 * * *` (daily at 6 AM UTC)
3. Command: `curl -H "Authorization: Bearer $CRON_SECRET" https://your-app.railway.app/api/daily-dnc-check`
4. Or use Railway's built-in cron service

## Step 5: Deploy

1. Railway will automatically detect your Next.js app
2. It will run `npm install` and `npm run build`
3. Your app will be live at `your-app.railway.app`

## Step 6: Custom Domain (Optional)

1. In Railway project → Settings → Domains
2. Click "Generate Domain" or "Add Custom Domain"
3. Follow DNS configuration instructions

## Step 7: Verify Data Persistence

1. Check that files are being written to `/data` directory
2. Verify in Railway logs that `DATA_DIR=/data` is being used
3. Test the daily DNC check endpoint manually first

## Environment Variables Reference

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `DATA_DIR` | Yes | Path to persistent data directory | `/data` (Railway) or `./data` (local) |
| `COGNITO_REFRESH_TOKEN` | No | Cognito refresh token for automatic token refresh (recommended) | - |
| `USHA_JWT_TOKEN` | No | USHA JWT token (optional, temporary) | - |
| `CRON_SECRET` | No | Secret for securing cron endpoints | - |
| `NODE_ENV` | Yes | Environment mode | `production` |

## Troubleshooting

### Files not persisting
- Verify volume is mounted at `/data`
- Check `DATA_DIR` environment variable is set
- Check Railway logs for file write errors

### Cron job not running
- Verify cron schedule is correct
- Check Railway cron logs
- Test endpoint manually first

### Build failures
- Check `package.json` scripts are correct
- Verify Node.js version compatibility
- Check Railway build logs

## Cost Estimate

- **Free tier**: Limited (good for testing)
- **Hobby plan**: ~$5-10/month (small apps)
- **Pro plan**: ~$20+/month (production apps)

## Support

- Railway Docs: https://docs.railway.app
- Railway Discord: https://discord.gg/railway
