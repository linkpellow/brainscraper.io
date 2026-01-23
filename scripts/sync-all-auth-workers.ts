/**
 * Sync All Auth Workers to Production
 * 
 * Syncs all local auth workers to production in one command.
 * 
 * Usage:
 *   tsx scripts/sync-all-auth-workers.ts [productionUrl]
 */

import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

const LOCAL_DATA_DIR = join(process.cwd(), 'data', 'auth-workers');
const PRODUCTION_URL = process.argv[2] || process.env.PRODUCTION_URL || 'https://brainscraper.io';

async function syncAllAuthWorkers() {
  try {
    if (!existsSync(LOCAL_DATA_DIR)) {
      console.error(`❌ Auth workers directory not found: ${LOCAL_DATA_DIR}`);
      process.exit(1);
    }

    const files = readdirSync(LOCAL_DATA_DIR).filter(f => f.endsWith('.json'));
    
    if (files.length === 0) {
      console.log('No auth workers found to sync');
      return;
    }

    console.log(`Found ${files.length} auth worker(s) to sync\n`);

    let successCount = 0;
    let failCount = 0;

    for (const file of files) {
      const sessionId = file.replace('.json', '');
      const filePath = join(LOCAL_DATA_DIR, file);
      
      try {
        const content = readFileSync(filePath, 'utf-8');
        const session = JSON.parse(content);

        if (!session.sessionId || !session.stabilized) {
          console.warn(`⚠️  Skipping ${sessionId} - invalid session data`);
          failCount++;
          continue;
        }

        console.log(`🔄 Syncing ${sessionId}...`);
        
        const response = await fetch(`${PRODUCTION_URL}/api/auth-worker/sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: content,
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ Failed to sync ${sessionId}: ${response.status} ${response.statusText}`);
          console.error(`   Error: ${errorText}`);
          failCount++;
          continue;
        }

        const result = await response.json();
        console.log(`✅ Synced ${sessionId} (${session.targetDomain || sessionId})`);
        successCount++;
      } catch (error: any) {
        console.error(`❌ Error syncing ${sessionId}:`, error.message);
        failCount++;
      }
    }

    console.log(`\n📊 Summary: ${successCount} succeeded, ${failCount} failed`);
    
    if (successCount > 0) {
      console.log(`\n🌐 View at: ${PRODUCTION_URL}/auth-workers`);
    }
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

syncAllAuthWorkers();
