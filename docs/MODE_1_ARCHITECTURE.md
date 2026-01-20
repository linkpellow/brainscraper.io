# Mode 1: Full Map - Local vs. Production Architecture

## 🏗️ **System Design**

Mode 1 (Full Map) is a **hybrid system** with components that run locally and components that run in production.

---

## 🌐 **Production (Railway/Render)**

### **✅ What Works in Production:**

1. **Next.js Web App**
   - UI/API routes
   - Data persistence (`/data` volume)
   - Lead enrichment
   - AI chat (OpenAI)
   - Manual endpoint management
   - Code generation (curl, fetch, axios, Python)

2. **Alternative Capture Methods**
   - **HAR Import**: Export `.har` file from Chrome DevTools → Network tab → Right-click → "Save all as HAR" → Import into Mode 1
   - **Manual Mode**: Manually paste network requests from DevTools
   - **Direct API Discovery**: Analyze existing captured traffic

### **❌ What DOESN'T Work in Production:**

1. **Browser Automation**
   - ❌ Playwright (requires system dependencies: `libgbm`, `libnss3`, `libatk`, etc.)
   - ❌ Chromium launch (no display environment in Docker)
   - ❌ DOM injection scripts

2. **Traffic Interception**
   - ❌ mitmproxy (requires Python system package)
   - ❌ WebSocket bridge (depends on mitmproxy)
   - ❌ Live traffic capture

---

## 💻 **Local Development**

### **✅ Full Mode 1 Features (Local Only):**

1. **Browser Automation**
   - ✅ Playwright Chromium launch
   - ✅ DOM snapshot injection (`dom-flipbook-inject.js`)
   - ✅ Full Map button mapping
   - ✅ Form state extraction (`__VIEWSTATE`, `__EVENTVALIDATION`)

2. **Traffic Interception**
   - ✅ mitmproxy (intercepts HTTPS traffic)
   - ✅ WebSocket bridge (streams to Next.js)
   - ✅ Real-time API discovery
   - ✅ Traffic Filter V2 (noise cancellation)

3. **API Intelligence**
   - ✅ Token extraction (JWT, OAuth, session, CSRF)
   - ✅ Variable detection (IDs, timestamps, UUIDs)
   - ✅ Direct API vs. form submission detection
   - ✅ Multi-state adaptation (detect form variations across states)

---

## 🚀 **Quick Start Guide**

### **Production Workflow (Railway/Render):**

1. **Visit**: `https://your-app.railway.app/tools/api-signal-explorer`
2. **Use HAR Import**:
   - Open Chrome DevTools (F12)
   - Navigate to Network tab
   - Interact with target site
   - Right-click → "Save all as HAR"
   - Upload HAR file to Mode 1
3. **Manual Mode**:
   - Copy network requests from DevTools
   - Paste into Mode 1 manually
4. **Features Available**:
   - ✅ AI chat for guidance
   - ✅ Code generation
   - ✅ Endpoint management
   - ✅ Traffic filtering (on uploaded HAR)

### **Local Workflow (Full Features):**

#### **Step 1: Install Dependencies**

```bash
# Install mitmproxy
pip install mitmproxy

# Or via Homebrew (Mac)
brew install mitmproxy

# Install Playwright browsers
npx playwright install chromium
```

#### **Step 2: Start Development Server**

```bash
# Terminal 1: Next.js dev server
npm run dev
```

#### **Step 3: Use Mode 1**

1. **Visit**: `http://localhost:3000/tools/api-signal-explorer`
2. **Click "Launch Browser"** (auto-starts everything):
   - mitmproxy (port 8080)
   - WebSocket bridge (port 8787)
   - Chromium with proxy configured
3. **Browse target site** in launched browser
4. **Mode 1 auto-captures**:
   - ✅ All API calls
   - ✅ Tokens/variables
   - ✅ DOM snapshots
5. **Features Available**:
   - ✅ Real-time traffic capture
   - ✅ Full Map button mapping
   - ✅ Multi-state testing
   - ✅ Direct API discovery
   - ✅ Adaptive workflow generation

---

## 🔧 **Architecture Diagram**

### **Local (Full Mode 1)**

```
You
 ↓
Next.js UI (localhost:3000)
 ↓
API Route: /api/explorer/launch-browser
 ↓
Playwright launches Chromium
 ↓ (proxied through)
mitmproxy (localhost:8080)
 ↓ (captures traffic)
WebSocket Bridge (localhost:8787)
 ↓ (streams to)
Next.js API: /api/explorer/stream-events
 ↓
Traffic Filter V2
 ↓
API Discovery
 ↓
Mode 1 UI (displays signals)
```

### **Production (Limited Mode 1)**

```
You
 ↓
Next.js UI (railway.app)
 ↓
HAR Import / Manual Mode
 ↓
Traffic Filter V2 (processes uploaded HAR)
 ↓
API Discovery
 ↓
Mode 1 UI (displays signals)
```

---

## 📊 **Feature Comparison**

| Feature | Local | Production (Railway/Render) |
|---------|-------|----------------------------|
| **UI/API Routes** | ✅ | ✅ |
| **HAR Import** | ✅ | ✅ |
| **Manual Mode** | ✅ | ✅ |
| **Code Generation** | ✅ | ✅ |
| **Traffic Filtering** | ✅ | ✅ (on uploaded HAR) |
| **AI Chat** | ✅ | ✅ |
| **Browser Launch** | ✅ | ❌ |
| **mitmproxy** | ✅ | ❌ |
| **Live Capture** | ✅ | ❌ |
| **DOM Injection** | ✅ | ❌ |
| **Full Map** | ✅ | ❌ |
| **Multi-State Testing** | ✅ | ❌ |

---

## ⚠️ **Why Browser Automation Doesn't Work in Production**

### **Technical Constraints:**

1. **No Display Environment**
   - Docker containers don't have X11/Wayland display servers
   - Chromium requires graphical environment (even in headless mode)

2. **Missing System Dependencies**
   - Playwright requires: `libgbm`, `libnss3`, `libatk`, `libcups2`, `libxkbcommon`, `libgtk-3-0`, etc.
   - Railway/Render base images don't include these (~50+ packages, 300-500MB)

3. **Resource Limits**
   - Chromium is memory-intensive (~200-500MB per instance)
   - Railway/Render free tiers have strict memory limits (512MB)

4. **Security Restrictions**
   - mitmproxy requires privileged access to intercept HTTPS
   - Production containers run in restricted user space

### **Solutions:**

1. **Local Development** (Recommended) ✅
   - Run Mode 1 locally for full features
   - Use production for data storage/sharing
   - **Cost**: $0/month

2. **HAR Import** (Alternative) ✅
   - Capture traffic locally in Chrome
   - Upload to production for analysis
   - **Cost**: $0/month

3. **Custom Dockerfile** (Not Recommended)
   - Add Playwright + mitmproxy to Docker image
   - **Cost**: $20-50/month (Railway Pro, 2GB RAM)
   - **Build time**: 5-10 minutes (vs. 1-2 minutes)
   - **Image size**: ~2GB (vs. 200MB)

---

## 🎯 **Use Cases**

### **When to Use Local Mode 1:**

- ✅ Building new automation workflows
- ✅ Multi-state form testing
- ✅ Discovering hidden APIs
- ✅ Mapping complex .aspx applications
- ✅ Real-time traffic analysis

### **When to Use Production Mode 1:**

- ✅ Sharing discovered APIs with team
- ✅ Analyzing pre-captured HAR files
- ✅ Managing/organizing endpoints
- ✅ Generating code snippets
- ✅ AI-assisted API documentation

---

## 🚨 **Common Errors & Solutions**

### **Error: `spawn mitmproxy ENOENT`**

**Cause:** mitmproxy not installed

**Solution:**
```bash
pip install mitmproxy
# Or: brew install mitmproxy
```

### **Error: `Executable doesn't exist at .../chromium-1200/chrome-linux64/chrome`**

**Cause:** Playwright browsers not installed

**Solution:**
```bash
npx playwright install chromium
```

### **Error: `WebSocket bridge failed to start`**

**Cause:** mitmproxy not running (bridge depends on it)

**Solution:**
1. Start mitmproxy first
2. Let "Launch Browser" button auto-start it
3. Or manually: `npm run mitm:stream` (Terminal 1) + `npm run mitm:bridge` (Terminal 2)

### **Error: `Failed to connect to WebSocket bridge`**

**Cause:** Bridge not listening on port 8787

**Solution:**
```bash
# Check if bridge is running
lsof -i :8787

# If not, start it
npm run mitm:bridge
```

---

## 📚 **Related Documentation**

- **Traffic Filter V2**: `docs/TRAFFIC_FILTER_V2_2026.md`
- **API Discovery**: `docs/API_SIGNAL_EXPLORER_SETUP.md`
- **Deployment**: `RENDER_DEPLOYMENT.md`, `RAILWAY_DEPLOYMENT.md`

---

## ✅ **Checklist**

### **Local Setup Checklist:**

- [ ] mitmproxy installed (`mitmproxy --version`)
- [ ] Playwright installed (`npx playwright --version`)
- [ ] Chromium downloaded (`npx playwright install chromium`)
- [ ] Next.js dev server running (`npm run dev`)
- [ ] Port 3000 available (Next.js)
- [ ] Port 8080 available (mitmproxy)
- [ ] Port 8787 available (WebSocket bridge)

### **Production Setup Checklist:**

- [ ] Railway/Render deployment active
- [ ] Environment variables configured
- [ ] `/data` volume mounted (Railway)
- [ ] HAR import workflow tested
- [ ] Manual mode workflow tested
- [ ] "Launch Browser" button disabled/hidden in production

---

## 🎓 **Summary**

**Mode 1 is designed for LOCAL DEVELOPMENT with full automation.**

Production deployments can still use Mode 1 features via:
- ✅ HAR import (capture locally, analyze anywhere)
- ✅ Manual mode (paste requests from DevTools)
- ✅ AI chat (guidance without automation)

**For the full Mode 1 experience (browser automation, live capture, DOM injection), run locally.**

**This design keeps production simple, fast, and free while preserving all critical functionality.**
