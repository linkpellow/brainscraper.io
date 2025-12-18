# Post-Deployment Checklist

## ✅ Code Deployed

**Commit**: `a71baad`  
**Branch**: `main`  
**Status**: Pushed to GitHub

## 🔧 Required: Set Environment Variable

**CRITICAL**: The deployment will fail until you set the `COGNITO_REFRESH_TOKEN` environment variable in your production environment.

### For Railway:

1. Go to Railway dashboard: https://railway.app
2. Select your `brainscraper.io` project
3. Go to **Variables** tab
4. Click **+ New Variable**
5. Add:
   - **Name**: `COGNITO_REFRESH_TOKEN`
   - **Value**: `[your-refresh-token-from-browser-console]`
6. Click **Add**
7. Railway will automatically redeploy

### For Vercel:

1. Go to Vercel dashboard: https://vercel.com
2. Select your `brainscraper.io` project
3. Go to **Settings** → **Environment Variables**
4. Click **Add New**
5. Add:
   - **Key**: `COGNITO_REFRESH_TOKEN`
   - **Value**: `[your-refresh-token-from-browser-console]`
   - **Environment**: Production (and Preview if needed)
6. Click **Save**
7. Go to **Deployments** tab
8. Click **Redeploy** on the latest deployment

## 🔍 How to Get Refresh Token

If you don't have the refresh token:

1. Open browser console on `https://app.tampausha.com`
2. Run: `scripts/extract-cognito-refresh-token.js`
3. Copy the refresh token from the output
4. Add it to your production environment variables

## ✅ Verify Deployment

After setting the environment variable:

1. Wait for deployment to complete (2-5 minutes)
2. Test the endpoint:
   ```bash
   curl "https://brainscraper.io/api/usha/scrub-phone?phone=2143493972"
   ```
3. Should return DNC status (not 500 error)

## 📊 Deployment Status

- ✅ Code committed and pushed
- ⏳ Waiting for deployment platform to build
- ⚠️ **REQUIRED**: Set `COGNITO_REFRESH_TOKEN` environment variable
- ⏳ Verify deployment after env var is set

## 🚨 If Deployment Fails

1. Check deployment logs in Railway/Vercel dashboard
2. Verify `COGNITO_REFRESH_TOKEN` is set correctly
3. Check for any build errors
4. Verify Node.js version is 20 (if specified)
