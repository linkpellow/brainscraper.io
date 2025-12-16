# Railway Deployment Checklist

## Pre-Deployment

- [x] ✅ Created `utils/dataDirectory.ts` - Centralized data directory management
- [x] ✅ Created `utils/fileLock.ts` - File locking for concurrent writes
- [x] ✅ Updated `app/api/daily-dnc-check/route.ts` - Uses DATA_DIR env var
- [x] ✅ Updated `app/api/load-enriched-results/route.ts` - Uses DATA_DIR env var
- [x] ✅ Updated `utils/geoIdDatabase.ts` - Uses DATA_DIR env var
- [x] ✅ Updated `utils/saveApiResults.ts` - Uses DATA_DIR env var
- [x] ✅ Created `railway.json` - Railway configuration
- [x] ✅ Created `railway.toml` - Railway configuration
- [x] ✅ Created `RAILWAY_DEPLOYMENT.md` - Deployment guide

## Railway Setup Steps

1. **Create Railway Project**
   - [ ] Sign up/login to Railway
   - [ ] Create new project
   - [ ] Connect GitHub repository

2. **Configure Persistent Volume**
   - [ ] Add Volume service
   - [ ] Name: `data-storage`
   - [ ] Mount path: `/data`

3. **Set Environment Variables**
   - [ ] `DATA_DIR=/data` (required)
   - [ ] `NODE_ENV=production` (required)
   - [ ] `CRON_SECRET=your-secret` (optional, for cron security)
   - [ ] `USHA_JWT_TOKEN=token` (optional, uses Crokodial if not set)

4. **Deploy Application**
   - [ ] Railway auto-detects Next.js
   - [ ] Verify build succeeds
   - [ ] Check deployment logs

5. **Configure Cron Job**
   - [ ] Add Cron service
   - [ ] Schedule: `0 6 * * *` (6 AM UTC daily)
   - [ ] Command: `curl -H "Authorization: Bearer $CRON_SECRET" https://your-app.railway.app/api/daily-dnc-check`
   - [ ] Or use Railway's built-in cron

6. **Custom Domain (Optional)**
   - [ ] Add custom domain in Railway
   - [ ] Configure DNS records
   - [ ] Verify SSL certificate

7. **Verify Data Persistence**
   - [ ] Test file writes work
   - [ ] Check `/data` directory has files
   - [ ] Verify data persists after restart

## Testing

- [ ] Test daily DNC check endpoint manually
- [ ] Verify enriched leads load correctly
- [ ] Check file writes persist
- [ ] Test cron job execution
- [ ] Monitor logs for errors

## Post-Deployment

- [ ] Monitor Railway logs
- [ ] Check data directory has files
- [ ] Verify cron job runs daily
- [ ] Test DNC checking works
- [ ] Monitor costs

## Troubleshooting

If files aren't persisting:
1. Check `DATA_DIR` env var is set to `/data`
2. Verify volume is mounted correctly
3. Check Railway logs for file write errors
4. Ensure volume has write permissions

If cron doesn't run:
1. Verify cron schedule syntax
2. Check Railway cron logs
3. Test endpoint manually first
4. Verify `CRON_SECRET` matches if using auth
