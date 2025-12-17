# Environment Variables Setup Guide

## Quick Reference

### 1. **INNGEST_EVENT_KEY** and **INNGEST_SIGNING_KEY**

**Where to get them:**
1. Go to [https://www.inngest.com](https://www.inngest.com)
2. Sign up for a free account (if you haven't already)
3. Create a new app called "brainscraper-io" (or use existing app)
4. In your Inngest dashboard, navigate to:
   - **Settings** → **Keys** (or **App Settings** → **Keys**)
5. You'll see two keys:
   - **Event Key** (starts with `eventkey-`) → This is your `INNGEST_EVENT_KEY`
   - **Signing Key** (starts with `signkey-`) → This is your `INNGEST_SIGNING_KEY`

**Visual Guide:**
```
Inngest Dashboard
  └─ Settings
      └─ Keys
          ├─ Event Key: eventkey-xxxxxxxxxxxxx  ← Copy this
          └─ Signing Key: signkey-xxxxxxxxxxxxx  ← Copy this
```

**Example values:**
```bash
INNGEST_EVENT_KEY=eventkey-prod_abc123xyz789
INNGEST_SIGNING_KEY=signkey-prod_def456uvw012
```

---

### 2. **NEXT_PUBLIC_BASE_URL**

**What it is:** Your production domain URL (where your app is deployed)

**Where to get it:**

#### If deployed on Railway:
1. Go to your Railway dashboard: [https://railway.app](https://railway.app)
2. Select your project
3. Click on your service/deployment
4. Look for the **"Domains"** or **"Settings"** section
5. You'll see your public URL (e.g., `https://your-app-name.up.railway.app`)
6. Copy the full URL including `https://`

**Example:**
```bash
NEXT_PUBLIC_BASE_URL=https://brainscraper-production.up.railway.app
```

#### If deployed on Vercel:
1. Go to your Vercel dashboard: [https://vercel.com](https://vercel.com)
2. Select your project
3. Go to **Settings** → **Domains**
4. Copy your production domain (e.g., `https://your-app.vercel.app`)

**Example:**
```bash
NEXT_PUBLIC_BASE_URL=https://brainscraper.vercel.app
```

#### If you have a custom domain:
Use your custom domain:
```bash
NEXT_PUBLIC_BASE_URL=https://brainscraper.io
```

---

## How to Set These Variables

### Option 1: Railway (Production)

1. Go to your Railway project dashboard
2. Click on your service
3. Go to **Variables** tab
4. Click **"New Variable"**
5. Add each variable:
   - Name: `INNGEST_EVENT_KEY`
   - Value: `eventkey-xxxxxxxxxxxxx` (paste from Inngest)
   - Click **"Add"**
   
   Repeat for:
   - `INNGEST_SIGNING_KEY`
   - `NEXT_PUBLIC_BASE_URL`

6. Railway will automatically redeploy after adding variables

### Option 2: Local Development (.env.local)

1. Create or edit `.env.local` in your project root:
```bash
# Inngest Configuration
INNGEST_EVENT_KEY=eventkey-your-key-here
INNGEST_SIGNING_KEY=signkey-your-key-here

# Base URL (use localhost for dev, production URL for production)
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

2. Restart your Next.js dev server after adding variables

---

## Verification Checklist

After setting the variables, verify they're working:

### 1. Check Inngest Connection
- Go to your Inngest dashboard
- Check if your functions are synced (should see "enrich-leads" and "scrape-linkedin" functions)
- If not synced, check that `/api/inngest` endpoint is accessible

### 2. Test Background Job
1. Start a small background enrichment job
2. Check the Background Jobs widget in the sidebar
3. Verify the job status updates
4. Check Inngest dashboard to see the function execution

### 3. Verify NEXT_PUBLIC_BASE_URL
- In production, background scraping jobs need this to call your API
- If not set, scraping jobs will fail with connection errors

---

## Troubleshooting

### "Inngest keys not configured" warning
- **Solution**: Make sure both `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` are set
- Check Railway variables are saved (not just typed)
- Restart your deployment after adding variables

### Background jobs not starting
- **Check**: Inngest dashboard → Functions → Are functions synced?
- **Check**: Railway logs for errors about missing keys
- **Test**: Visit `https://your-domain.com/api/inngest` - should return Inngest sync info

### Scraping jobs fail with "localhost" errors
- **Solution**: Set `NEXT_PUBLIC_BASE_URL` to your production domain
- Make sure it includes `https://` (not just the domain name)

---

## Security Notes

⚠️ **Important:**
- Never commit `.env.local` to git (it's in `.gitignore`)
- Never share your Inngest keys publicly
- Rotate keys if accidentally exposed
- Use Railway's environment variables (not hardcoded in code)

---

## Quick Setup Script

For Railway, you can set all three at once via CLI:

```bash
railway variables set INNGEST_EVENT_KEY=eventkey-xxx
railway variables set INNGEST_SIGNING_KEY=signkey-xxx
railway variables set NEXT_PUBLIC_BASE_URL=https://your-domain.com
```

Or via Railway dashboard → Variables → Add each one.

---

**Need Help?**
- Inngest Docs: https://www.inngest.com/docs
- Railway Docs: https://docs.railway.app
- Check `docs/BACKGROUND_JOBS_SETUP.md` for more details
