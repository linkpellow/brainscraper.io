# brainscraper.io

Internal tooling for lead enrichment, scrubbing, and operational workflows.

## Manual DNC token

DNC scrubbing uses a **manually managed** JWT stored in server settings (persisted in `data/settings.json`). The Lead Generation UI lets you save and test the token without ever displaying the full value—only a masked preview is shown.

### Setup

1. Navigate to **Lead Generation → Settings**.
2. Paste the DNC JWT into the token field.
3. Click **Save Token** and then **Test Connection**.

If the token is missing or invalid, DNC endpoints respond with:

```
DNC token not configured. Add token in Lead Generation > Settings.
```

### Design notes

- Auto-refresh is **removed by design**. Update the token manually whenever it expires.
- Tokens are masked in responses/logs (only the last 4 characters are shown).
