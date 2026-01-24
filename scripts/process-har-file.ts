/**
 * Script to process a HAR file and create an auth worker
 * Usage: tsx scripts/process-har-file.ts <path-to-har-file>
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { processHARComplete } from '../app/auth-workers/[sessionId]/map-api/harIngestion';
import { createAuthWorkerFromHAR } from '../app/auth-workers/[sessionId]/map-api/harToAuthWorker';
import { persistAuthWorkerState } from '../app/auth-workers/utils/authWorkerPersistence';

async function main() {
  const harFilePath = process.argv[2];
  
  if (!harFilePath) {
    console.error('Usage: tsx scripts/process-har-file.ts <path-to-har-file>');
    process.exit(1);
  }

  try {
    console.log(`[ProcessHAR] Reading HAR file: ${harFilePath}`);
    const harContent = readFileSync(harFilePath, 'utf-8');
    const fileName = harFilePath.split('/').pop() || 'uploaded.har';
    
    console.log(`[ProcessHAR] Processing HAR file (${(harContent.length / 1024 / 1024).toFixed(2)}MB)...`);
    const { bundle, catalog: processedCatalog, automationGroups: groups } = await processHARComplete(harContent, fileName);
    
    // Determine target domain from HAR
    const oauthProviders = ['microsoftonline.com', 'login.microsoftonline.com', 'accounts.google.com', 'auth0.com', 'okta.com'];
    const nonOAuthFirstParty = bundle.hosts.firstParty.filter(host => 
      !oauthProviders.some(provider => host.includes(provider))
    );
    const targetDomain = nonOAuthFirstParty[0] || bundle.hosts.firstParty[0] || bundle.hosts.hostInfo[0]?.host || 'unknown';
    
    console.log(`[ProcessHAR] Target domain: ${targetDomain}`);
    console.log(`[ProcessHAR] First-party hosts: ${bundle.hosts.firstParty.join(', ')}`);
    
    // Create auth worker from HAR
    const harSessionId = `har_${Date.now()}_${targetDomain.replace(/[^a-zA-Z0-9]/g, '_')}`;
    console.log(`[ProcessHAR] Creating auth worker with session ID: ${harSessionId}...`);
    
    const harAuthWorker = createAuthWorkerFromHAR(bundle, harSessionId, targetDomain);
    
    if (!harAuthWorker) {
      console.error('[ProcessHAR] ❌ Could not create auth worker from HAR - no authentication method found');
      const authMethods = [
        bundle.authArtifacts.filter(a => a.type === 'bearer_token').length > 0 ? 'Bearer tokens' : null,
        bundle.authArtifacts.filter(a => a.type === 'api_key').length > 0 ? 'API keys' : null,
        bundle.cookieJar.timeline.length > 0 ? 'Cookies' : null,
      ].filter(Boolean);
      
      console.error(`[ProcessHAR] Found auth methods: ${authMethods.join(', ') || 'none'}`);
      process.exit(1);
    }
    
    // Persist auth worker
    persistAuthWorkerState(harAuthWorker.sessionId, harAuthWorker);
    console.log(`[ProcessHAR] ✅ Auth worker created and persisted: ${harAuthWorker.sessionId}`);
    
    // Show auth details
    const extractedVars = harAuthWorker.step2.extractedVars;
    console.log(`[ProcessHAR] Auth method: ${extractedVars.auth_method || 'unknown'}`);
    console.log(`[ProcessHAR] Has access_token: ${!!extractedVars.access_token}`);
    console.log(`[ProcessHAR] Has refresh_token: ${!!extractedVars.refresh_token}`);
    console.log(`[ProcessHAR] Has refresh_url: ${!!extractedVars.refresh_url}`);
    console.log(`[ProcessHAR] Expires at: ${extractedVars.expires_at ? new Date(parseInt(extractedVars.expires_at, 10)).toISOString() : 'unknown'}`);
    
    // Sync to server if in production
    if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT) {
      try {
        const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN 
          ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` 
          : 'https://brainscraper.io';
        
        console.log(`[ProcessHAR] Syncing to server: ${baseUrl}/api/auth-worker/sync`);
        const response = await fetch(`${baseUrl}/api/auth-worker/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(harAuthWorker),
        });
        
        if (response.ok) {
          console.log(`[ProcessHAR] ✅ Synced to server`);
        } else {
          console.warn(`[ProcessHAR] ⚠️ Server sync failed: ${response.status} ${response.statusText}`);
        }
      } catch (syncError) {
        console.warn('[ProcessHAR] ⚠️ Failed to sync to server:', syncError);
      }
    }
    
    console.log(`[ProcessHAR] ✅ Done! Auth worker available at: /auth-workers/${harAuthWorker.sessionId}`);
    console.log(`[ProcessHAR] View at: https://brainscraper.io/auth-workers/${harAuthWorker.sessionId}`);
    
  } catch (error) {
    console.error('[ProcessHAR] ❌ Error processing HAR file:', error);
    if (error instanceof Error) {
      console.error('[ProcessHAR] Stack:', error.stack);
    }
    process.exit(1);
  }
}

main();
