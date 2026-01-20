# mitmproxy Setup Guide

## 🔌 **Port Configuration**

| Service | Port | Purpose |
|---------|------|---------|
| **Next.js Dev Server** | `3000` | Main web application |
| **mitmproxy** | `8080` | HTTP/HTTPS proxy intercepts traffic |
| **WebSocket Bridge** | `8787` | Streams mitmproxy data to Next.js |

---

## 🚀 **Quick Start**

### **1. Install mitmproxy**

```bash
# Via pip (Python package manager)
pip install mitmproxy

# Or via Homebrew (macOS)
brew install mitmproxy

# Verify installation
mitmproxy --version
```

### **2. Start Services**

#### **Option A: Manual Start (3 terminals)**

```bash
# Terminal 1: Next.js dev server
cd /Users/linkpellow/brainscraper.io-1
npm run dev

# Terminal 2: mitmproxy
npm run mitm:stream

# Terminal 3: WebSocket bridge
npm run mitm:bridge
```

#### **Option B: Auto-Start via UI (Recommended)**

1. Start Next.js: `npm run dev`
2. Visit: http://localhost:3000/tools/api-signal-explorer
3. Click **"Launch Browser"** button
   - Automatically starts mitmproxy (port 8080)
   - Automatically starts WebSocket bridge (port 8787)
   - Launches Chromium with proxy configured

---

## 🏗️ **Architecture**

```
You interact with browser
        ↓
Chromium (launched by Playwright)
        ↓ (all traffic routed through)
mitmproxy (localhost:8080)
        ↓ (writes events to)
Python addon (tools/mitmproxy/stream_ws.py)
        ↓ (sends via WebSocket)
WebSocket Bridge (localhost:8787)
        ↓ (forwards to)
Next.js API (/api/explorer/stream-events)
        ↓ (processes with)
Traffic Filter V2
        ↓ (displays in)
Mode 1 UI (localhost:3000/tools/api-signal-explorer)
```

---

## 📋 **What Each Service Does**

### **mitmproxy (Port 8080)**

**Purpose**: Intercepts ALL HTTP/HTTPS traffic from the browser

**How it works:**
- Acts as a "man-in-the-middle" proxy
- Decrypts HTTPS traffic (using self-signed certificate)
- Captures request/response details
- Runs Python addon (`tools/mitmproxy/stream_ws.py`)

**Key Features:**
- Captures method, URL, headers, body
- Captures response status, headers, body
- Filters by content type (JSON, HTML, etc.)
- Extracts timing information

**Environment Variables:**
```bash
MITM_PROXY_PORT=8080  # Default port
```

### **WebSocket Bridge (Port 8787)**

**Purpose**: Streams mitmproxy events to Next.js in real-time

**How it works:**
- Listens for WebSocket connections from Next.js
- Reads events from mitmproxy addon
- Forwards events to connected clients
- Handles reconnection logic

**Key Features:**
- Real-time event streaming
- Multiple client support
- Automatic reconnection
- Heartbeat/keepalive

**Environment Variables:**
```bash
BRIDGE_PORT=8787  # Default port
```

**Source:**
- Server: `src/server/wsMitmBridge.ts`
- Client: `app/tools/api-signal-explorer/NeuromapWorkspace.tsx`

### **Next.js (Port 3000)**

**Purpose**: Web application and API routes

**How it works:**
- Serves UI at `/tools/api-signal-explorer`
- Connects to WebSocket bridge via `wsRef`
- Processes traffic with Traffic Filter V2
- Displays filtered events in real-time

**Key Features:**
- Mode 1: Full Map interface
- Traffic filtering (80+ noise domains)
- Token extraction (JWT, OAuth, session, CSRF)
- Variable detection (IDs, timestamps, UUIDs)
- AI-powered API discovery

---

## 🔧 **Troubleshooting**

### **Error: `spawn mitmproxy ENOENT`**

**Cause:** mitmproxy not installed

**Solution:**
```bash
pip install mitmproxy
# Or: brew install mitmproxy
```

### **Error: `WebSocket connection failed`**

**Cause:** Bridge not running or wrong port

**Solution:**
```bash
# Check if bridge is running
lsof -i :8787

# If not, start it
npm run mitm:bridge

# Check logs in terminal
```

### **Error: `mitmproxy: Address already in use`**

**Cause:** Port 8080 already in use

**Solution:**
```bash
# Find process using port 8080
lsof -i :8080

# Kill the process
kill -9 <PID>

# Or use a different port
MITM_PROXY_PORT=8081 npm run mitm:stream
```

### **No traffic captured**

**Causes:**
1. Browser not launched with proxy
2. mitmproxy not running
3. WebSocket bridge not running
4. Certificate not trusted

**Solutions:**
1. Use "Launch Browser" button (auto-configures proxy)
2. Check mitmproxy is running: `lsof -i :8080`
3. Check bridge is running: `lsof -i :8787`
4. Trust mitmproxy certificate (see below)

---

## 🔐 **Certificate Setup**

### **Why Certificate Trust is Needed**

mitmproxy uses a self-signed certificate to decrypt HTTPS traffic. Browsers need to trust this certificate.

### **Auto-Trust (via Playwright)**

When using "Launch Browser" button, Playwright launches Chromium with:
```javascript
ignoreHTTPSErrors: true
```

This automatically trusts the mitmproxy certificate.

### **Manual Trust (if needed)**

1. Start mitmproxy: `mitmproxy`
2. Visit: http://mitm.it in your browser
3. Download certificate for your OS
4. Install certificate in system keychain
5. Set to "Always Trust"

---

## 📊 **Monitoring**

### **Check Service Status**

```bash
# Check if mitmproxy is running
lsof -i :8080

# Check if bridge is running
lsof -i :8787

# Check if Next.js is running
lsof -i :3000

# Check all at once
lsof -i :3000 -i :8080 -i :8787
```

### **View Logs**

```bash
# mitmproxy logs (if started manually)
mitmproxy -s tools/mitmproxy/stream_ws.py --listen-port 8080

# WebSocket bridge logs (if started manually)
npm run mitm:bridge

# Next.js logs
npm run dev
```

### **WebSocket Connection Status**

Check in Mode 1 UI:
- Green indicator: Connected
- Red indicator: Disconnected
- Yellow indicator: Connecting

---

## 🎯 **Testing the Setup**

### **1. Basic Test**

```bash
# Terminal 1: Start Next.js
npm run dev

# Terminal 2: Start mitmproxy
npm run mitm:stream

# Terminal 3: Start bridge
npm run mitm:bridge

# Browser: Visit Mode 1
# http://localhost:3000/tools/api-signal-explorer

# Click "Launch Browser"
# Browse any site
# Check if endpoints appear in Mode 1 UI
```

### **2. Manual Test (without UI)**

```bash
# Terminal 1: Start mitmproxy
mitmproxy -s tools/mitmproxy/stream_ws.py --listen-port 8080

# Terminal 2: Start bridge
npm run mitm:bridge

# Terminal 3: Test with curl (proxied)
curl -x http://localhost:8080 http://example.com

# Check bridge terminal for events
```

---

## 🔄 **Restart Services**

### **Quick Restart**

```bash
# Kill all services
pkill -f mitmproxy
pkill -f "node.*wsMitmBridge"
pkill -f "next dev"

# Restart Next.js
npm run dev

# Let UI auto-start mitmproxy + bridge
# (click "Launch Browser")
```

### **Full Restart**

```bash
# Kill all node processes (nuclear option)
pkill -9 node

# Kill mitmproxy
pkill -9 mitmproxy

# Restart everything
npm run dev  # Terminal 1
npm run mitm:stream  # Terminal 2 (optional)
npm run mitm:bridge  # Terminal 3 (optional)
```

---

## 📚 **Related Documentation**

- **Mode 1 Architecture**: `docs/MODE_1_ARCHITECTURE.md`
- **Traffic Filter V2**: `docs/TRAFFIC_FILTER_V2_2026.md`
- **API Signal Explorer Setup**: `docs/API_SIGNAL_EXPLORER_SETUP.md`
- **mitmproxy Python Addon**: `tools/mitmproxy/stream_ws.py`
- **WebSocket Bridge**: `src/server/wsMitmBridge.ts`

---

## ✅ **Quick Reference**

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js (port 3000) |
| `npm run mitm:stream` | Start mitmproxy (port 8080) |
| `npm run mitm:bridge` | Start WebSocket bridge (port 8787) |
| `lsof -i :8080` | Check if mitmproxy is running |
| `lsof -i :8787` | Check if bridge is running |
| `pkill -f mitmproxy` | Stop mitmproxy |
| `pkill -f wsMitmBridge` | Stop bridge |

---

## 🎓 **Summary**

**3 Services, 3 Ports, 1 Goal:**

1. **mitmproxy (8080)**: Intercepts browser traffic
2. **WebSocket Bridge (8787)**: Streams events to Next.js
3. **Next.js (3000)**: Displays filtered API signals

**Easiest Setup:**
1. Run: `npm run dev`
2. Visit: http://localhost:3000/tools/api-signal-explorer
3. Click: "Launch Browser"
4. Done! All services auto-start.

**For Full Control:**
- Start all 3 services manually in separate terminals
- Monitor logs in each terminal
- Restart individual services as needed
