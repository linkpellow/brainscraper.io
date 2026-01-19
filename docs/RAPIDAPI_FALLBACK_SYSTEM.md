# RapidAPI Fallback System

## Overview

The RapidAPI Fallback System provides automatic failover across multiple RapidAPI keys when requests fail due to rate limits, authentication errors, or server errors. This ensures high availability and reliability for all RapidAPI integrations.

## Features

- **Automatic Fallback**: Automatically tries the next key when a request fails
- **Smart Cooldown**: Failed keys are temporarily excluded (5-minute cooldown) to avoid repeated failures
- **Status Code Awareness**: Retries on specific HTTP status codes (429, 401, 403, 500, 502, 503, 504)
- **Key Pool Management**: Manages 13 RapidAPI keys (1 primary + 12 fallbacks)
- **Zero Configuration**: Works automatically - no code changes needed for basic usage

## Key Pool

### Primary Key
- `23e5cf67c6msh42e5d1ffe1031d1p160ee7jsn51d55368d962` (current production key)

### Fallback Keys (12 keys)
1. `ca25fc890cmshbde400744151111p196a39jsn3766335bdb2d`
2. `22a0943c83msh01134e539f944dep1f94b0jsn344549892142`
3. `153030ee5fmshff8f27c8dffad43p184730jsn66125ce1022f`
4. `207dab623bmshd5489bad6877fd1p1b74b1jsn5c45ff592ddc`
5. `7d1dc0f3a7mshab3d33d0c0b9e93p11e59ajsn8ee26f7b3cle`
6. `1478e15d3amshaf4ed4f262c3f62p142992jsnfd93e036e4b9`
7. `9b319b4093msh279e530fdecaa4fp159a9ajsn35fc4025c8ad`
8. `9ff0771033mshdbf07158395d628p184a24jsnfd0e143f6320`
9. `07615c41edmsh7b03d2971dc7546p1fc375jsn996094913f04`
10. `a3754c7cacmsh711a6326ef6a312p1962a6jsna820058ef872`
11. `325452db2emsh59a2cf36411dc00p14cbc8jsnc55f14187683`
12. `45257c4c8amsh7d09cf0c53c412ap1174adjsnaa7cd32f70ff`

## Usage

### Basic Usage (Recommended)

Use the `fetchWithRapidAPIFallback` function for all RapidAPI calls:

```typescript
import { fetchWithRapidAPIFallback } from '@/utils/rapidapiKeyManager';

// Make a RapidAPI request with automatic fallback
const result = await fetchWithRapidAPIFallback(
  'https://skip-tracing-working-api.p.rapidapi.com/search/byname?name=John%20Doe',
  'skip-tracing-working-api.p.rapidapi.com',
  { method: 'GET' }
);

if (result.error) {
  console.error('Request failed:', result.error);
} else {
  console.log('Success:', result.data);
  console.log('Used key:', result.usedKey?.substring(0, 10) + '...');
}
```

### Advanced Usage

Customize retry behavior:

```typescript
const result = await fetchWithRapidAPIFallback(
  url,
  host,
  {
    method: 'POST',
    body: JSON.stringify(data),
    headers: {
      'Custom-Header': 'value'
    }
  },
  [429, 401, 403, 500, 502, 503, 504] // Custom retry status codes
);
```

### Using with RapidAPIClient

The `RapidAPIClient` class now supports fallback automatically:

```typescript
import { RapidAPIClient } from '@/utils/rapidapi';

const client = new RapidAPIClient({
  host: 'skip-tracing-working-api.p.rapidapi.com',
  baseUrl: 'https://skip-tracing-working-api.p.rapidapi.com',
  useFallback: true // Enabled by default
});

// All requests automatically use fallback
const data = await client.get('/search/byname?name=John%20Doe');
```

### Manual Key Management

```typescript
import {
  getAllRapidAPIKeys,
  getPrimaryRapidAPIKey,
  getAvailableKeys,
  markKeyAsFailed,
  resetFailedKeys,
  getKeyStats
} from '@/utils/rapidapiKeyManager';

// Get all keys
const allKeys = getAllRapidAPIKeys();

// Get primary key
const primaryKey = getPrimaryRapidAPIKey();

// Get available keys (excluding those in cooldown)
const availableKeys = getAvailableKeys();

// Manually mark a key as failed
markKeyAsFailed('some-key-here');

// Reset all failed keys (useful for testing)
resetFailedKeys();

// Get statistics
const stats = getKeyStats();
console.log(`Total keys: ${stats.totalKeys}`);
console.log(`Available: ${stats.availableKeys}`);
console.log(`Failed: ${stats.failedKeys}`);
```

## How It Works

1. **Request Initiation**: When a RapidAPI request is made, the system starts with the primary key
2. **Failure Detection**: If the request fails with a retryable status code (429, 401, 403, 500, etc.), the system:
   - Marks the failed key (if it's a rate limit or auth error)
   - Automatically tries the next available key
3. **Cooldown Period**: Failed keys are excluded for 5 minutes to prevent repeated failures
4. **Success**: When a request succeeds, the system returns the data and logs which key was used
5. **Exhaustion**: If all keys fail, the system returns an error

## Status Codes

### Retryable Status Codes (Default)
- `429` - Too Many Requests (Rate Limit)
- `401` - Unauthorized (Auth Error)
- `403` - Forbidden (Auth Error)
- `500` - Internal Server Error
- `502` - Bad Gateway
- `503` - Service Unavailable
- `504` - Gateway Timeout

### Non-Retryable Status Codes
- `400` - Bad Request (client error, won't retry)
- `404` - Not Found (client error, won't retry)
- Other 4xx errors (client errors, won't retry)

## Updated Endpoints

The following endpoints have been updated to use the fallback system:

- ✅ `/api/skip-tracing` - Skip Tracing API
- ✅ `/api/enrich-single-field` - Single Field Enrichment (Skip-tracing calls)
- ✅ `RapidAPIClient` class - All clients using this class

## Migration Guide

### Before (Old Code)

```typescript
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const response = await fetch(url, {
  headers: {
    'x-rapidapi-key': RAPIDAPI_KEY,
    'x-rapidapi-host': host,
  },
});
```

### After (New Code)

```typescript
import { fetchWithRapidAPIFallback } from '@/utils/rapidapiKeyManager';

const result = await fetchWithRapidAPIFallback(url, host, { method: 'GET' });
if (result.error) {
  // Handle error
} else {
  // Use result.data
}
```

## Environment Variables

The system respects the `RAPIDAPI_KEY` environment variable:
- If set, it's used as the primary key
- If not set, the default primary key is used
- Fallback keys are always available regardless of environment variable

## Monitoring

The system logs key usage for debugging:
- `[RapidAPI Key Manager] Attempting request with key X/Y`
- `[RapidAPI Key Manager] Request successful with key ...`
- `[RapidAPI Key Manager] Marked key ... as failed`

## Best Practices

1. **Always use fallback**: Use `fetchWithRapidAPIFallback` for all RapidAPI calls
2. **Handle errors gracefully**: Check `result.error` before using `result.data`
3. **Monitor key usage**: Use `getKeyStats()` to monitor key health
4. **Don't hardcode keys**: Let the system manage keys automatically
5. **Respect cooldowns**: Don't manually reset failed keys unless necessary

## Troubleshooting

### All Keys Failed
If all keys are in cooldown:
- Wait 5 minutes for cooldown to expire
- Check if keys are valid
- Verify network connectivity

### Key Not Working
- Check if key is in cooldown: `getKeyStats()`
- Verify key format (should start with letters/numbers and end with alphanumeric)
- Check RapidAPI dashboard for key status

### Performance Issues
- The system tries keys sequentially (not in parallel)
- Failed keys are cached to avoid repeated failures
- Cooldown prevents unnecessary retries

## Future Enhancements

Potential improvements:
- Parallel key testing
- Key health scoring
- Automatic key rotation
- Rate limit prediction
- Key usage analytics
