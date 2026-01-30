# brainscraper.io

Internal tooling for lead enrichment, scrubbing, and operational workflows.

## Manual DNC JWT

This app is single-user, so the DNC scrubbing token UI stores your JWT in `localStorage` (key: `dnc.jwt`) on your own browser only. The token is **unmasked** and never sent to analytics or logs. Clear it any time via the **Clear token** button on `/settings/dnc`.

To enable/disable the settings UI, set:

```bash
NEXT_PUBLIC_ENABLE_DNC_TOKEN_UI=true
```

When enabled, DNC scrubbing requests automatically attach `Authorization: Bearer <token>` for API calls.
