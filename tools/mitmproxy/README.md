# mitmproxy Tools

Tools for exporting and streaming mitmproxy flows into a clean, normalized format for analysis in the API Signal Explorer.

For a full checklist of manual steps (bridge, mitmproxy, proxy config, mobile proxy/CA, screen share), see **docs/API_SIGNAL_EXPLORER_SETUP.md**.

## Setup

1. Install mitmproxy and websockets (from project root or `tools/mitmproxy/`):
   ```bash
   pip install -r tools/mitmproxy/requirements.txt
   ```
   Or: `pip install mitmproxy websockets`

2. Install Node.js dependencies (for WebSocket bridge):
   ```bash
   npm install
   ```

## Usage Modes

### Mode 1: File Export (One-Time Capture)

1. Run mitmproxy with the export script:
   ```bash
   mitmdump -s export_flows.py
   ```

   Or use the interactive UI:
   ```bash
   mitmweb -s export_flows.py
   ```

2. **Configure your device/browser** to use mitmproxy as a proxy
3. **Perform your actions** (navigate, interact, etc.)
4. **Stop mitmproxy** (Ctrl+C) - flows are automatically exported to `mitm_flows.json`
5. **Import into API Signal Explorer**:
   - Navigate to `/tools/api-signal-explorer` in the app
   - Click "Upload mitmproxy Export"
   - Select `mitm_flows.json`
   - View analyzed endpoints with noise suppression

### Mode 2: Live Streaming (Real-Time)

1. **Start the WebSocket bridge**:
   ```bash
   npm run mitm:bridge
   ```

2. **Start mitmproxy with streaming** (from project root):
   ```bash
   mitmproxy -s tools/mitmproxy/stream_ws.py
   ```
   Or from `tools/mitmproxy/`: `mitmproxy -s stream_ws.py`  
   Or run: `npm run mitm:stream` to print the exact command.

3. **Configure your device/browser** to use mitmproxy as a proxy
4. **Open API Signal Explorer**:
   - Navigate to `/tools/api-signal-explorer` in the app
   - Click "Connect"
   - Watch endpoints appear in real-time

5. **Use interaction tagging**:
   - Click "Mark Next Interaction" before performing an action
   - Events during the next 3 seconds will be tagged as `interaction`
   - Click "Stop Tagging" to end early

## Features

### File Export (`export_flows.py`)
- Clean, normalized flow events
- Redacted sensitive data (auth headers, cookies)
- Session metadata (start/end times, duration)
- One-time export to JSON file

### Live Streaming (`stream_ws.py`)
- Real-time WebSocket streaming
- Automatic redaction before sending
- Throttled batching (25 events or 100ms)
- Reconnect tolerant (buffers up to 2000 events)
- Zero file exports needed

### WebSocket Bridge (`wsMitmBridge.ts`)
- Receives events from mitmproxy at `/mitm`
- Forwards to browser clients at `/explorer`
- Maintains event history (last 10,000 events)
- Heartbeat/ping-pong support
- Final safety redaction guardrail

## Output Format

Both modes produce the same event schema:
- Clean, normalized flow events
- Redacted sensitive data (auth headers, cookies)
- Session metadata (start/end times, duration)
- Ready for analysis in API Signal Explorer

## Customization

### Export Script (`export_flows.py`)
- Change output filename
- Add custom redaction rules
- Include/exclude specific flows
- Add additional metadata

### Streaming Script (`stream_ws.py`)
- Change WebSocket URL via `MITM_WS_URL` environment variable
- Adjust batch size (`BATCH_SIZE`)
- Adjust batch interval (`BATCH_INTERVAL_MS`)
- Adjust buffer size (`MAX_BUFFER_SIZE`)

### Bridge (`wsMitmBridge.ts`)
- Change port (default: 8787)
- Adjust history size (`MAX_EVENTS_HISTORY`)
- Add custom redaction rules

## Schema

See `export_schema.json` for the complete export format specification.

## Troubleshooting

### WebSocket Connection Failed
- Make sure the bridge is running: `npm run mitm:bridge`
- Check that port 8787 is not in use
- Verify mitmproxy is running with `stream_ws.py`

### No Events Appearing
- Check mitmproxy is capturing traffic (verify proxy settings)
- Check WebSocket connection status in Explorer UI
- Verify mitmproxy addon is connected (check bridge logs)

### Events Appearing Slowly
- This is normal - events are batched for performance
- Batch size: 25 events or 100ms, whichever comes first

### Mobile: Phone Proxy and HTTPS
- On the phone: Wi‑Fi → your network → Proxy: Manual → Host: your computer’s LAN IP, Port: 8080.
- For HTTPS: install mitmproxy’s CA on the phone. Run `mitmproxy` once, visit http://mitm.it on the phone (with proxy set), download and install the cert for your OS.
- Phone screen into the app: use AirPlay (iOS→Mac), Cast (Android→Chrome), or similar, then in the app choose “Share” and pick that window/screen when prompted.
