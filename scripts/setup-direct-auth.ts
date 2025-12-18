/**
 * Setup Direct Authentication from Extracted Token
 * 
 * This script helps you set up direct authentication using the token
 * you extracted from the browser console.
 */

import * as fs from 'fs';
import * as path from 'path';

interface TokenData {
  token: string;
  refresh_token?: string;
  expires_at?: string;
  user?: string;
}

function setupDirectAuth(tokenData: TokenData): void {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔧 USHA DIRECT AUTHENTICATION SETUP');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Decode token to get expiration
  let expiration: number | null = null;
  try {
    const parts = tokenData.token.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      expiration = payload.exp ? payload.exp * 1000 : null;
      console.log('📋 Token Information:');
      console.log(`   User: ${payload.Email || payload.unique_name || 'N/A'}`);
      console.log(`   Agent Number: ${payload.AgentNumber || 'N/A'}`);
      console.log(`   Expires: ${expiration ? new Date(expiration).toISOString() : 'N/A'}`);
      console.log(`   Expires In: ${expiration ? Math.floor((expiration - Date.now()) / 1000 / 60) : 'N/A'} minutes\n`);
    }
  } catch (e) {
    console.warn('⚠️  Could not decode token');
  }

  // Generate .env.local content
  const envContent = `# USHA Direct Authentication Configuration
# Generated: ${new Date().toISOString()}

# Option 1: Use extracted token directly (temporary - expires in ~24 hours)
USHA_JWT_TOKEN=${tokenData.token}
${tokenData.refresh_token ? `USHA_REFRESH_TOKEN=${tokenData.refresh_token}` : ''}

# Option 2: Direct Authentication (permanent - recommended)
# Uncomment and configure one of these methods:

# Client Credentials (OAuth 2.0) - BEST for automation
# USHA_CLIENT_ID=your-client-id-here
# USHA_CLIENT_SECRET=your-client-secret-here

# Username/Password - Alternative method
# USHA_USERNAME=your-email@ushadvisors.com
# USHA_PASSWORD=your-password-here

# Note: The system will automatically use direct auth when credentials are configured.
# Priority: Cognito Refresh Token > Client Credentials > Username/Password > Environment Token
`;

  // Save to .env.local
  const envPath = path.join(process.cwd(), '.env.local');
  const existingEnv = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';
  
  // Check if USHA config already exists
  if (existingEnv.includes('USHA_JWT_TOKEN') || existingEnv.includes('USHA_CLIENT_ID')) {
    console.log('⚠️  .env.local already contains USHA configuration');
    console.log('   Review and update manually if needed.\n');
  } else {
    // Append to existing .env.local or create new
    const newContent = existingEnv ? `${existingEnv}\n\n${envContent}` : envContent;
    fs.writeFileSync(envPath, newContent);
    console.log('✅ Configuration written to .env.local\n');
  }

  // Display instructions
  console.log('📝 Next Steps:\n');
  
  if (tokenData.refresh_token) {
    console.log('✅ Refresh token found! The system will automatically refresh tokens.');
    console.log('   No additional action needed for token refresh.\n');
  } else {
    console.log('⚠️  No refresh token found. To enable automatic refresh:');
    console.log('   1. Run scripts/extract-refresh-token.js in browser console');
    console.log('   2. Add USHA_REFRESH_TOKEN to .env.local\n');
  }

  console.log('🔍 To find permanent credentials (client_id/client_secret):');
  console.log('   1. Run scripts/extract-usha-auth-flow.js in browser console');
  console.log('   2. Look for OAuth client credentials in the captured requests');
  console.log('   3. Or check USHA API documentation for client credentials\n');

  console.log('💡 The system will automatically:');
  console.log('   - Use direct auth when credentials are configured');
  console.log('   - Refresh tokens automatically before expiration');
  console.log('   - System uses Cognito refresh token for automatic token management\n');

  if (expiration && expiration < Date.now() + (24 * 60 * 60 * 1000)) {
    console.log('⚠️  WARNING: Token expires within 24 hours!');
    console.log('   Set up permanent credentials (client_id/client_secret) for long-term automation.\n');
  }
}

// Main execution
const tokenArg = process.argv[2];

if (!tokenArg) {
  console.error('Usage: npx tsx scripts/setup-direct-auth.ts <token> [refresh_token]');
  console.error('\nOr provide token data via stdin JSON:');
  console.error('  echo \'{"token":"...","refresh_token":"..."}\' | npx tsx scripts/setup-direct-auth.ts --stdin');
  process.exit(1);
}

if (tokenArg === '--stdin') {
  // Read from stdin
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    input += chunk;
  });
  process.stdin.on('end', () => {
    try {
      const data = JSON.parse(input);
      setupDirectAuth(data);
    } catch (e) {
      console.error('❌ Invalid JSON input:', e);
      process.exit(1);
    }
  });
} else {
  // Token provided as argument
  const tokenData: TokenData = {
    token: tokenArg,
    refresh_token: process.argv[3]
  };
  setupDirectAuth(tokenData);
}
