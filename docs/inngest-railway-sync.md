# Inngest + Railway: Why jobs stay pending and how to fix it

**Last updated:** 2026-03-10

## Keys are not enough

`INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` in Railway let the **app send events** to Inngest. They do **not** tell Inngest where your app is. Until Inngest knows your app’s URL, it cannot run your functions, so every job stays **pending**.

## You must sync the app (Railway has no Inngest integration)

On Railway you have to **manually sync** the app with Inngest Cloud so Inngest knows the URL of your `/api/inngest` endpoint.

### One-time setup (or after first deploy)

1. Deploy your app on Railway and note the public URL (e.g. `https://your-app.up.railway.app`).
2. In [Inngest Cloud](https://app.inngest.com), open the right environment (e.g. Production).
3. Go to **Apps** and click **Sync App** (or **Sync New App**).
4. Paste your **serve endpoint URL**:  
   `https://<your-railway-domain>/api/inngest`  
   Example: `https://brainscraper-production.up.railway.app/api/inngest`
5. Click **Sync App**. Inngest will GET that URL, discover your functions, and register the app.

After a successful sync, new enrichment, scraping, and WARN-match jobs should run instead of staying pending.

### After every deploy (resync)

When you deploy new code that changes Inngest functions, resync so Inngest has the latest function list:

**From the Inngest dashboard**

- Open your app → **Resync** (top right). If the app URL changed, enable **Override** and enter the new URL, then **Resync App**.

**From the command line (e.g. in CI or locally)**

```bash
curl -X PUT "https://<your-railway-domain>/api/inngest" --fail-with-body
```

Replace `<your-railway-domain>` with your real Railway host (e.g. `brainscraper-production.up.railway.app`).

## Verify the endpoint is reachable

Inngest must be able to reach your app from the internet:

```bash
curl -s -o /dev/null -w "%{http_code}" "https://<your-railway-domain>/api/inngest"
```

You should get `200`. If you get a timeout or 5xx, fix deployment or networking first, then sync again.

## Summary

| Step | What it does |
|------|----------------|
| Set `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY` in Railway | Lets the app send events to Inngest. |
| **Sync app** in Inngest Cloud with `https://<your-app>/api/inngest` | Tells Inngest where to run your functions. |
| Resync after deploys | Keeps Inngest’s function list in sync with your code. |

Without the sync step, keys alone will not run any jobs; they will stay pending.
