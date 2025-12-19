/**
 * Automatic Orphan Recovery Job
 * 
 * Runs every 5 minutes to recover any orphaned leads
 * Leads are considered orphaned if they exist in enriched-leads/ but not in enriched-all-leads.json
 */

import { recoverOrphanedLeads } from './leadDataManager';

let recoveryInterval: NodeJS.Timeout | null = null;
const RECOVERY_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Start automatic orphan recovery
 */
export function startOrphanRecovery(): void {
  if (recoveryInterval) {
    return; // Already running
  }
  
  console.log('[ORPHAN_RECOVERY] Starting automatic orphan recovery (every 5 minutes)');
  
  // Run immediately on start
  runRecovery();
  
  // Then run every 5 minutes
  recoveryInterval = setInterval(() => {
    runRecovery();
  }, RECOVERY_INTERVAL_MS);
}

/**
 * Stop automatic orphan recovery
 */
export function stopOrphanRecovery(): void {
  if (recoveryInterval) {
    clearInterval(recoveryInterval);
    recoveryInterval = null;
    console.log('[ORPHAN_RECOVERY] Stopped automatic orphan recovery');
  }
}

/**
 * Run orphan recovery
 */
async function runRecovery(): Promise<void> {
  try {
    console.log('[ORPHAN_RECOVERY] Running orphan recovery check...');
    const result = await recoverOrphanedLeads();
    
    if (result.recovered > 0) {
      console.log(`[ORPHAN_RECOVERY] ✅ Recovered ${result.recovered} orphaned leads`);
    } else if (result.errors > 0) {
      console.error(`[ORPHAN_RECOVERY] ⚠️ Recovery completed with ${result.errors} errors`);
    } else {
      console.log('[ORPHAN_RECOVERY] No orphaned leads found');
    }
  } catch (error) {
    console.error('[ORPHAN_RECOVERY] ❌ Recovery failed:', error);
  }
}

// Note: Orphan recovery is started explicitly in app/api/inngest/route.ts
// This ensures it runs in all environments, not just production
