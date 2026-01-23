/**
 * API Signal Explorer - Quarantined
 * 
 * This feature has been shelved. The UI components have been moved to .quarantine/api-signal-explorer-ui/
 * 
 * Utilities (authWorkerPersistence, authWorkerServerStorage, useTokenRefresh) remain active
 * and are used by the Auth Workers feature.
 */

'use client';

import { Shield } from 'lucide-react';
import Link from 'next/link';

export default function ApiSignalExplorerPage() {
  return (
    <div className="min-h-screen p-8 flex items-center justify-center">
      <div className="text-center max-w-md">
        <Shield className="w-16 h-16 text-white/20 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-white mb-2">API Signal Explorer</h1>
        <p className="text-white/60 mb-6">
          This feature has been temporarily shelved. The UI components have been quarantined.
        </p>
        <p className="text-white/40 text-sm mb-6">
          The Auth Workers feature (HAR-based workflow) is now the primary method for managing authentication sessions.
        </p>
        <Link
          href="/auth-workers"
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg transition-colors"
        >
          Go to Auth Workers
        </Link>
      </div>
    </div>
  );
}
