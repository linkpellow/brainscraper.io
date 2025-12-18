# AWS Cognito Authentication Setup

## Overview

The Tampa/LeadArena API (`optic-prod-api.leadarena.com`) uses **AWS Cognito** for authentication, not traditional OAuth 2.0. This guide explains how to set up automated authentication.

## Authentication Flow

The system uses AWS Cognito ID tokens as Bearer tokens for API requests. The token is obtained through:

1. **Username/Password Authentication** - Direct login with Cognito
2. **Refresh Token** - Automatic token refresh (recommended)
3. **Manual Token** - Environment variable (temporary)

## Configuration Options

### Option 1: Username/Password (Recommended for Initial Setup)

```bash
# In .env.local or Railway/Vercel
COGNITO_USERNAME=your-email@example.com
COGNITO_PASSWORD=your-password
```

**Note**: This will authenticate on first use and cache the refresh token automatically.

### Option 2: Refresh Token (Best for Production)

After initial authentication, extract the refresh token and use it:

```bash
COGNITO_REFRESH_TOKEN=your-refresh-token-here
```

The system will automatically refresh the ID token when it expires.

### Option 3: Manual ID Token (Temporary)

For testing or when you have a fresh token:

```bash
COGNITO_ID_TOKEN=your-cognito-id-token-here
```

**Warning**: This token will expire (typically 1 hour). Use refresh token for permanent automation.

## Cognito Configuration

The system uses these default Cognito settings (can be overridden):

```bash
COGNITO_USER_POOL_ID=us-east-1_SWmFzvnku
COGNITO_CLIENT_ID=5dromsrnopienmqa83ba4n927h
COGNITO_REGION=us-east-1
```

## Extracting Credentials

### Step 1: Capture Login Flow

Run this script in the browser console **BEFORE** logging in:

```javascript
// Copy and paste: scripts/capture-cognito-auth-flow.js
```

Then log in. The script will capture:
- Cognito authentication requests
- Access tokens
- ID tokens
- Refresh tokens

After login, run:
```javascript
showCognitoCapture()
```

### Step 2: Extract Refresh Token

If you already have a token, check localStorage:

```javascript
// Check for Cognito tokens in localStorage
Object.keys(localStorage).forEach(key => {
  const value = localStorage.getItem(key);
  if (value && (value.includes('cognito') || value.includes('refresh'))) {
    console.log(key, value);
  }
});
```

### Step 3: Decode Token

To see token expiration and details:

```javascript
// Copy and paste: scripts/decode-cognito-token.js
```

## How It Works

1. **Token Priority**:
   - Cached token (if valid)
   - Environment variable (`COGNITO_ID_TOKEN`)
   - Refresh token (automatic refresh)
   - Username/password (authenticate and cache refresh token)

2. **Automatic Refresh**:
   - System checks token expiration
   - Automatically refreshes using refresh token
   - Caches new tokens for future use

3. **Token Caching**:
   - Tokens are cached in memory
   - Expiration is checked before use
   - Automatic refresh when expired

## Testing

Test the authentication:

```bash
# Test with username/password
COGNITO_USERNAME=your-email@example.com
COGNITO_PASSWORD=your-password
npm run test:cognito

# Or test with refresh token
COGNITO_REFRESH_TOKEN=your-refresh-token
npm run test:cognito
```

## Troubleshooting

### "Failed to obtain Cognito token"

**Solution**: Ensure one of these is configured:
- `COGNITO_USERNAME` + `COGNITO_PASSWORD`
- `COGNITO_REFRESH_TOKEN`
- `COGNITO_ID_TOKEN`

### "Challenge required" Error

**Solution**: Cognito may require:
- MFA setup
- New password
- Email verification

Handle these challenges manually in the browser, then extract the refresh token.

### Token Expires Quickly

**Solution**: Use refresh token instead of ID token. Refresh tokens don't expire (unless revoked).

## Security Notes

- **Never commit** `.env.local` or environment variables to git
- **Refresh tokens** are long-lived - treat them as secrets
- **Rotate tokens** if compromised
- Use **environment variables** in production (Railway, Vercel, etc.)

## Next Steps

1. Extract refresh token using the capture script
2. Add `COGNITO_REFRESH_TOKEN` to your environment
3. System will automatically handle token refresh
4. No manual intervention needed

## Integration

The Cognito authentication is automatically integrated into `getUshaToken()`. It's checked before OAuth fallbacks, so once configured, it will be used automatically.
