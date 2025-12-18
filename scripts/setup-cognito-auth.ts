#!/usr/bin/env tsx
/**
 * Setup Cognito Authentication
 * 
 * Adds Cognito refresh token to .env.local for permanent automation
 */

import * as fs from 'fs';
import * as path from 'path';

const refreshToken = process.argv[2];

if (!refreshToken) {
  console.error('❌ Error: Refresh token required');
  console.log('\nUsage:');
  console.log('  npx tsx scripts/setup-cognito-auth.ts "your-refresh-token-here"');
  console.log('\nOr provide the token from the extraction script output.\n');
  process.exit(1);
}

const envPath = path.join(process.cwd(), '.env.local');
const existingEnv = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';

// Check if COGNITO_REFRESH_TOKEN already exists
if (existingEnv.includes('COGNITO_REFRESH_TOKEN=')) {
  console.log('⚠️  .env.local already contains COGNITO_REFRESH_TOKEN');
  console.log('   Updating with new token...\n');
  
  // Replace existing token
  const updatedEnv = existingEnv.replace(
    /COGNITO_REFRESH_TOKEN=.*/g,
    `COGNITO_REFRESH_TOKEN=${refreshToken}`
  );
  fs.writeFileSync(envPath, updatedEnv);
} else {
  // Append new configuration
  const cognitoConfig = `\n# AWS Cognito Authentication (Tampa/LeadArena API)
# Added: ${new Date().toISOString()}
COGNITO_REFRESH_TOKEN=${refreshToken}

# Optional: Override defaults if needed
# COGNITO_USER_POOL_ID=us-east-1_SWmFzvnku
# COGNITO_CLIENT_ID=5dromsrnopienmqa83ba4n927h
# COGNITO_REGION=us-east-1
`;

  const newContent = existingEnv ? `${existingEnv}${cognitoConfig}` : cognitoConfig.trimStart();
  fs.writeFileSync(envPath, newContent);
}

console.log('✅ Cognito refresh token added to .env.local\n');
console.log('📝 Next Steps:');
console.log('   1. Restart your Next.js dev server (if running)');
console.log('   2. The system will automatically use this token for authentication');
console.log('   3. Tokens will be automatically refreshed when they expire\n');
console.log('💡 The refresh token enables permanent automation without manual intervention.\n');
