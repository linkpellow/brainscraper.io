# Deploying to Render

## ✅ **Fixed Issues**

1. **styled-jsx Server Component Error** - FIXED
   - Added `"use client"` to `app/brainscraper-start/page.tsx`
   - Build should now succeed

2. **Render Configuration** - READY
   - `render.yaml` created with optimal settings

---

## 🚀 **Deploy to Render (Step-by-Step)**

### **Option 1: Deploy via Dashboard (Recommended)**

1. **Go to Render Dashboard**
   - Visit: https://dashboard.render.com/

2. **Connect Repository**
   - Click **"New +"** → **"Web Service"**
   - Connect your GitHub account if not already connected
   - Select repository: `brainscraper.io-1` (or your repo name)
   - Click **"Connect"**

3. **Configure Service**
   - **Name**: `brainscraper-io` (or your preferred name)
   - **Region**: Oregon (US West)
   - **Branch**: `main`
   - **Root Directory**: (leave blank)
   - **Runtime**: Node
   - **Build Command**: `npm ci && npm run build`
   - **Start Command**: `npm start`
   - **Plan**: Starter ($7/month) or Free

4. **Add Environment Variables**
   Click **"Advanced"** and add your environment variables:
   ```
   NODE_ENV=production
   NODE_VERSION=20.18.1
   PORT=3000
   
   # Add your actual values:
   OPENAI_API_KEY=sk-...
   DATABASE_URL=postgresql://...
   NEXT_PUBLIC_API_URL=https://your-domain.onrender.com
   
   # Add any other env vars from Railway
   ```

5. **Deploy**
   - Click **"Create Web Service"**
   - Render will automatically build and deploy
   - First build takes ~5-10 minutes

6. **Check Deployment**
   - Once deployed, you'll get a URL: `https://brainscraper-io.onrender.com`
   - Click the URL to verify your app is running

---

### **Option 2: Deploy via render.yaml (Auto-Config)**

1. **Push render.yaml to GitHub**
   ```bash
   git add render.yaml RENDER_DEPLOYMENT.md
   git commit -m "Add Render deployment configuration"
   git push
   ```

2. **Create Blueprint on Render**
   - Go to: https://dashboard.render.com/
   - Click **"New +"** → **"Blueprint"**
   - Connect your repo: `brainscraper.io-1`
   - Render will detect `render.yaml` automatically
   - Click **"Apply"**

3. **Add Environment Variables**
   - Render will create the service from `render.yaml`
   - Go to service → **"Environment"** → Add your env vars
   - Click **"Save Changes"**

4. **Trigger Deploy**
   - Service will automatically deploy
   - Monitor logs in Render dashboard

---

## 📋 **Environment Variables Checklist**

Make sure to add these from your Railway setup:

- [ ] `OPENAI_API_KEY` - OpenAI API key for AI features
- [ ] `DATABASE_URL` - PostgreSQL connection string (if using DB)
- [ ] `NEXT_PUBLIC_API_URL` - Your Render app URL
- [ ] `SESSION_SECRET` - Random secret for sessions (if applicable)
- [ ] `INNGEST_SIGNING_KEY` - Inngest key (if using)
- [ ] `INNGEST_EVENT_KEY` - Inngest event key (if using)
- [ ] Any other custom env vars your app needs

---

## 🔧 **Troubleshooting**

### **Build Fails**
- Check Render logs for specific errors
- Ensure all dependencies are in `package.json`
- Verify Node version is correct (20.18.1)

### **App Crashes on Start**
- Check that `server.js` exists and works
- Verify `npm start` runs locally
- Check environment variables are set correctly

### **Port Issues**
- Render automatically sets PORT env var
- Your app should listen on `process.env.PORT` (default: 3000)

### **Environment Variables Missing**
- Go to Render dashboard → Your service → "Environment"
- Add any missing variables
- Click "Save Changes" (triggers redeploy)

---

## ⚡ **Performance Tips**

1. **Enable HTTP/2**
   - Automatically enabled on Render

2. **Use CDN for Static Assets**
   - Next.js automatically optimizes static assets
   - Consider Cloudflare for additional caching

3. **Database Connection Pooling**
   - If using PostgreSQL, configure connection pooling
   - Render PostgreSQL includes built-in pooling

4. **Upgrade Plan if Needed**
   - Free tier: Limited resources, sleeps after inactivity
   - Starter ($7/mo): Always on, better performance
   - Standard ($25/mo): More resources for production

---

## 📊 **Comparing Render vs Railway**

| Feature | Render | Railway |
|---------|--------|---------|
| **Build Time** | ~5-10 min | ~5-10 min |
| **Auto-Deploy** | ✅ Yes | ✅ Yes |
| **Free Tier** | ✅ Yes (limited) | ✅ Yes (limited) |
| **Pricing** | $7/mo starter | $5/mo starter |
| **Uptime** | 99.9% | 99.9% |
| **Support** | Community + Email | Community + Discord |
| **Ease of Use** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

Both are excellent choices! Render is great for:
- Simple, straightforward deployments
- Built-in PostgreSQL with good pricing
- Excellent documentation

---

## ✅ **Next Steps After Deployment**

1. **Verify Deployment**
   - Visit your Render URL
   - Test all critical features
   - Check logs for any errors

2. **Set Up Custom Domain** (Optional)
   - Go to Render dashboard → Your service → "Settings"
   - Add custom domain
   - Update DNS records as instructed

3. **Enable Auto-Deploy**
   - Already enabled by default
   - Every push to `main` triggers new deployment

4. **Monitor Performance**
   - Check Render metrics dashboard
   - Set up error tracking (Sentry, etc.) if needed

5. **Backup Environment Variables**
   - Save your env vars securely
   - Document which services use which keys

---

## 🎯 **Done!**

Your app should now be live on Render! 🚀

If you encounter any issues, check:
1. Render build logs
2. Render runtime logs
3. Environment variables are set
4. Database connection (if applicable)

Need help? Check Render docs: https://docs.render.com/
