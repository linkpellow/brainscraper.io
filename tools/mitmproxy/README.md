# mitmproxy Export Tools

Tools for exporting mitmproxy flows into a clean, normalized format for analysis in the API Signal Explorer.

## Setup

1. Install mitmproxy:
   ```bash
   pip install mitmproxy
   ```

2. Run mitmproxy with the export script:
   ```bash
   mitmdump -s export_flows.py
   ```

   Or use the interactive UI:
   ```bash
   mitmweb -s export_flows.py
   ```

## Usage

1. **Start mitmproxy** with the export script
2. **Configure your device/browser** to use mitmproxy as a proxy
3. **Perform your actions** (navigate, interact, etc.)
4. **Stop mitmproxy** (Ctrl+C) - flows are automatically exported to `mitm_flows.json`

## Output

The script generates `mitm_flows.json` with:
- Clean, normalized flow events
- Redacted sensitive data (auth headers, cookies)
- Session metadata (start/end times, duration)
- Ready for import into API Signal Explorer

## Import into API Signal Explorer

1. Navigate to `/tools/api-signal-explorer` in the app
2. Click "Upload mitmproxy Export"
3. Select `mitm_flows.json`
4. View analyzed endpoints with noise suppression

## Customization

Edit `export_flows.py` to:
- Change output filename
- Add custom redaction rules
- Include/exclude specific flows
- Add additional metadata

## Schema

See `export_schema.json` for the complete export format specification.
