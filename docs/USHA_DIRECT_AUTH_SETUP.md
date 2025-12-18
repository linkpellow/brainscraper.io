# USHA Direct Authentication Setup

## Overview

This system implements **direct authentication** with USHA API using Cognito refresh tokens. It supports automatic token refresh and handles all authentication flows automatically without any middleman services.

## Authentication Methods Supported

### 1. Client Credentials (OAuth 2.0) - **RECOMMENDED**
Best for service-to-service authentication. Permanent credentials that don't expire.

**Setup:**
```bash
USHA_CLIENT_ID=your-client-id
USHA_CLIENT_SECRET=your-client-secret
```

### 2. Username/Password
For user-based authentication. Supports automatic token refresh if refresh_token is available.

**Setup:**
```bash
USHA_USERNAME=your-email@ushadvisors.com
USHA_PASSWORD=your-password
```

### 3. Environment Variable (Manual Token)
For testing or when you have a token already.

**Setup:**
```bash
USHA_JWT_TOKEN=your-jwt-token-here
```

## Step 1: Extract Authentication Credentials

### Option A: Extract from Browser Console

1. Open `https://agent.ushadvisors.com` in browser
2. Open Developer Tools (F12)
3. Go to Console tab
4. Run the extraction script:

```javascript
// Copy and paste scripts/extract-usha-auth-flow.js
```

This will capture:
- Login endpoints
- Token endpoints
- Refresh endpoints
- Client credentials (if available)
- Username/password flow

### Option B: Extract Refresh Token

If you already have a token, extract the refresh token:

```javascript
// Copy and paste scripts/extract-refresh-token.js
```

This will find:
- Refresh token in localStorage
- Refresh token endpoints
- Token refresh flow

## Step 2: Discover Endpoints

Run the discovery script to analyze your HAR file and find authentication endpoints:

```bash
npx tsx scripts/discover-usha-endpoints.ts [path-to-har-file]
```

This will:
- Analyze HAR file for auth endpoints
- Check environment variables
- Recommend the best authentication method
- Save discovery results to `usha-auth-discovery.json`

## Step 3: Configure Credentials

Based on what you found, set the appropriate environment variables:

### For Client Credentials:
```bash
# In .env.local or Railway/Vercel
USHA_CLIENT_ID=your-client-id
USHA_CLIENT_SECRET=your-client-secret
```

### For Username/Password:
```bash
# In .env.local or Railway/Vercel
USHA_USERNAME=your-email@ushadvisors.com
USHA_PASSWORD=your-password
```

### For Refresh Token (if you have one):
```bash
# The system will automatically use refresh tokens if available
# No additional configuration needed if refresh_token is in token cache
```

## Step 4: Verify Setup

The system automatically uses direct authentication when credentials are configured. Check logs for:

```
🔑 [USHA_AUTH] Authenticating with client credentials...
✅ [USHA_AUTH] Authenticated with client credentials
```

Or:

```
🔑 [USHA_AUTH] Authenticating with username/password...
✅ [USHA_AUTH] Authenticated with username/password
```

## How It Works

### Priority Order:

1. **Provided Token** (from request parameter)
2. **Cached Token** (if still valid)
3. **Environment Variable** (USHA_JWT_TOKEN)
4. **Direct Authentication**:
   - Client Credentials (if configured)
   - Username/Password (if configured)
   - Token Refresh (if refresh_token available)
5. **Cognito authentication** (automatic refresh via COGNITO_REFRESH_TOKEN)

### Automatic Token Refresh:

- Tokens are cached with expiration tracking
- System automatically refreshes tokens before expiration
- Refresh tokens are stored and reused
- No manual intervention required

### Token Caching:

- Tokens cached in memory (server-side)
- Expiration tracked from JWT payload
- Automatic refresh 60 seconds before expiration
- Cache cleared on authentication errors

## Integration

The system integrates seamlessly with existing code. No changes needed to API routes:

```typescript
import { getUshaToken } from '@/utils/getUshaToken';

// This now automatically uses direct auth if configured
const token = await getUshaToken();
```

## Troubleshooting

### "Direct authentication not available"
- Check that credentials are set in environment variables
- Verify credentials are correct
- Check that authentication endpoints are accessible

### "Token refresh failed"
- Verify refresh_token is available
- Check refresh endpoint is correct
- Ensure refresh_token hasn't expired

### "All token sources failed"
- Verify at least one authentication method is configured
- Check network connectivity to USHA API
- Review logs for specific error messages

## Security Notes

⚠️ **Important:**
- Never commit credentials to version control
- Use environment variables or secure secret management
- Rotate credentials regularly
- Monitor token usage and expiration

## Next Steps

1. Extract credentials using browser scripts
2. Run discovery script to find endpoints
3. Configure environment variables
4. Test authentication
5. Monitor logs to verify direct auth is working

The system automatically uses Cognito refresh tokens for seamless token management.
