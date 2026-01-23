/**
 * Sync Auth Worker to Production
 * 
 * Reads local auth worker data and syncs it to production via API
 * 
 * Usage:
 *   tsx scripts/sync-auth-worker-to-production.ts [sessionId] [productionUrl]
 * 
 * Examples:
 *   tsx scripts/sync-auth-worker-to-production.ts har_1769121913693_agent_ushadvisors_com
 *   tsx scripts/sync-auth-worker-to-production.ts har_1769121913693_agent_ushadvisors_com https://brainscraper.io
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const SESSION_ID = process.argv[2] || 'har_1769121913693_agent_ushadvisors_com';
const PRODUCTION_URL = process.argv[3] || process.env.PRODUCTION_URL || 'https://brainscraper.io';

async function syncAuthWorkerToProduction() {
  try {
    // Read local auth worker file
    const dataDir = join(process.cwd(), 'data', 'auth-workers');
    const filePath = join(dataDir, `${SESSION_ID}.json`);
    
    if (!existsSync(filePath)) {
      console.error(`❌ Auth worker file not found: ${filePath}`);
      console.log(`\nAvailable auth workers:`);
      try {
        const fs = require('fs');
        const files = fs.readdirSync(dataDir).filter((f: string) => f.endsWith('.json'));
        files.forEach((f: string) => console.log(`  - ${f.replace('.json', '')}`));
      } catch (e) {
        console.error('Could not list available workers');
      }
      process.exit(1);
    }
    
    console.log(`📖 Reading auth worker: ${SESSION_ID}`);
    const fileContent = readFileSync(filePath, 'utf-8');
    const session = JSON.parse(fileContent);
    
    // Validate session data
    if (!session.sessionId || !session.stabilized) {
      console.error('❌ Invalid session data: missing sessionId or not stabilized');
      process.exit(1);
    }
    
    console.log(`✅ Loaded session:`, {
      sessionId: session.sessionId,
      targetDomain: session.targetDomain,
      stabilized: session.stabilized,
      stabilizedAt: new Date(session.stabilizedAt).toISOString(),
    });
    
    // Sync to production
    const syncUrl = `${PRODUCTION_URL}/api/auth-worker/sync`;
    console.log(`\n🔄 Syncing to production: ${syncUrl}`);
    
    const response = await fetch(syncUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(session),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Sync failed: ${response.status} ${response.statusText}`);
      console.error(`Error: ${errorText}`);
      process.exit(1);
    }
    
    const result = await response.json();
    console.log(`✅ Successfully synced to production!`);
    console.log(`   Session ID: ${result.sessionId}`);
    console.log(`\n🌐 View at: ${PRODUCTION_URL}/auth-workers/${SESSION_ID}`);
    
  } catch (error: any) {
    console.error('❌ Error syncing auth worker:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

syncAuthWorkerToProduction();
