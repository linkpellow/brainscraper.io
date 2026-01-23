/**
 * HAR Upload Section Component
 * 
 * Extracted from AuthWorkersPage for reuse in dashboard
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, FileText, Sparkles } from 'lucide-react';
import { processHARComplete } from '../[sessionId]/map-api/harIngestion';
import { createAuthWorkerFromHAR } from '../[sessionId]/map-api/harToAuthWorker';
import { persistAuthWorkerState } from '../utils/authWorkerPersistence';
import { getSessionById, listAllSessions, type PersistedAuthWorkerState } from '../utils/authWorkerPersistence';
import { useToast } from '../[sessionId]/map-api/hooks/useToast';
import { enrichSessionFromHAR } from '../[sessionId]/map-api/enrichAuthWorker';

type HARUploadSectionProps = {
  onWorkerCreated?: (worker: PersistedAuthWorkerState) => void;
  existingSessions?: PersistedAuthWorkerState[];
};

export default function HARUploadSection({ onWorkerCreated, existingSessions = [] }: HARUploadSectionProps) {
  const router = useRouter();
  const toast = useToast();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.har')) {
      setError('Please upload a .har file');
      toast.error('Please upload a .har file');
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      const text = await file.text();
      const { bundle, catalog: processedCatalog, automationGroups: groups } = await processHARComplete(text, file.name);
      
      // Determine target domain from HAR
      const oauthProviders = ['microsoftonline.com', 'login.microsoftonline.com', 'accounts.google.com', 'auth0.com', 'okta.com'];
      const nonOAuthFirstParty = bundle.hosts.firstParty.filter(host => 
        !oauthProviders.some(provider => host.includes(provider))
      );
      const targetDomain = nonOAuthFirstParty[0] || bundle.hosts.firstParty[0] || bundle.hosts.hostInfo[0]?.host || 'unknown';
      
      // Try to find existing session for this domain
      const existingSessionForDomain = existingSessions.find(s => s.targetDomain === targetDomain);
      
      let sessionId: string;
      let session: PersistedAuthWorkerState | null = null;
      
      // FIRST: Try to enrich existing session
      if (existingSessionForDomain) {
        sessionId = existingSessionForDomain.sessionId;
        const enrichmentResult = await enrichSessionFromHAR(sessionId, bundle);
        
        if (enrichmentResult.enriched) {
          console.log('[HARUpload] ✅ Enriched existing session:', enrichmentResult);
          toast.success(`✅ Enriched auth worker: Added ${enrichmentResult.addedFields.join(', ')}`);
          
          if (enrichmentResult.missingFields.length > 0) {
            toast.warning(`⚠️ Still missing: ${enrichmentResult.missingFields.join(', ')}`);
          }
          
          // Reload session
          const reloaded = getSessionById(sessionId);
          if (reloaded) {
            session = reloaded;
            if (onWorkerCreated) {
              onWorkerCreated(reloaded);
            }
          }
        }
      }
      
      // SECOND: Create or update auth worker from HAR
      const harSessionId = sessionId || `har_${Date.now()}_${targetDomain.replace(/[^a-zA-Z0-9]/g, '_')}`;
      const harAuthWorker = createAuthWorkerFromHAR(bundle, harSessionId, targetDomain);
      
      if (harAuthWorker) {
        persistAuthWorkerState(harAuthWorker.sessionId, harAuthWorker);
        
        // Sync to server
        try {
          await fetch('/api/auth-worker/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(harAuthWorker),
          });
        } catch (syncError) {
          console.warn('[HARUpload] Failed to sync auth worker to server:', syncError);
        }
        
        if (!existingSessionForDomain) {
          toast.success(`✅ Auth worker created from HAR: ${harAuthWorker.sessionId.substring(0, 8)}...`);
          if (onWorkerCreated) {
            onWorkerCreated(harAuthWorker);
          }
        }
        
        // Navigate to worker detail page
        router.push(`/auth-workers/${harAuthWorker.sessionId}`);
      } else {
        console.warn('[HARUpload] Could not create auth worker from HAR - no authentication method found');
        const authMethods = [
          bundle.authArtifacts.filter(a => a.type === 'bearer_token').length > 0 ? 'Bearer tokens' : null,
          bundle.authArtifacts.filter(a => a.type === 'api_key').length > 0 ? 'API keys' : null,
          bundle.cookieJar.timeline.length > 0 ? 'Cookies' : null,
        ].filter(Boolean);

        const message = authMethods.length > 0
          ? `HAR processed, but could not create auth worker. Found: ${authMethods.join(', ')}. Please ensure your HAR includes authenticated requests.`
          : 'HAR processed, but no authentication method found. Please ensure your HAR includes authenticated API requests with Authorization headers, cookies, or API keys.';

        toast.warning(message);
      }
      
      // Save HAR data to server
      if (harAuthWorker || sessionId) {
        try {
          const harDataPayload = {
            sessionId: harAuthWorker?.sessionId || sessionId,
            harFileName: file.name,
            uploadedAt: Date.now(),
            artifactBundle: bundle,
            catalog: processedCatalog,
            automationGroups: groups,
          };

          // Check payload size (limit to ~50MB)
          const payloadString = JSON.stringify(harDataPayload);
          const payloadSizeMB = payloadString.length / (1024 * 1024);
          
          if (payloadSizeMB > 50) {
            console.warn(`[HARUpload] HAR data too large (${payloadSizeMB.toFixed(2)}MB), saving without full bundle`);
            const lightPayload = {
              sessionId: harDataPayload.sessionId,
              harFileName: harDataPayload.harFileName,
              uploadedAt: harDataPayload.uploadedAt,
              catalog: processedCatalog,
              automationGroups: groups,
              artifactBundle: {
                metadata: bundle.metadata,
                totalEvents: bundle.events.length,
                totalCookies: bundle.cookieJar.timeline.length,
                totalAuthArtifacts: bundle.authArtifacts.length,
              },
            };
            
            await fetch('/api/auth-worker/har-data', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(lightPayload),
            });
          } else {
            const saveResponse = await fetch('/api/auth-worker/har-data', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: payloadString,
            });
            
            if (!saveResponse.ok) {
              let errorData: any = {};
              try {
                errorData = await saveResponse.json();
              } catch {
                const errorText = await saveResponse.text();
                errorData = { message: errorText || 'Unknown error' };
              }
              console.error('[HARUpload] Failed to save HAR data:', errorData);
            }
          }
        } catch (saveError) {
          console.error('[HARUpload] Failed to save HAR data:', saveError);
        }
      }
      
      toast.success(`HAR file processed: ${file.name}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to process HAR file';
      setError(errorMessage);
      toast.error(errorMessage);
      console.error('[HARUpload] Error:', err);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="bg-white/5 border border-white/10 rounded-lg p-6">
      <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <Upload className="w-5 h-5" />
        Import HAR File
      </h2>
      
      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <div className="text-sm text-red-400">{error}</div>
        </div>
      )}
      
      <div className="flex items-center gap-4">
        <label
          htmlFor="har-upload"
          className={`flex-1 flex items-center justify-center gap-3 p-6 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
            processing
              ? 'border-white/20 bg-white/5 cursor-not-allowed'
              : 'border-white/20 hover:border-emerald-500/50 hover:bg-emerald-500/5'
          }`}
        >
          <input
            id="har-upload"
            type="file"
            accept=".har"
            onChange={handleFileUpload}
            disabled={processing}
            className="hidden"
          />
          {processing ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-emerald-400 border-t-transparent"></div>
              <span className="text-white/60">Processing HAR file...</span>
            </>
          ) : (
            <>
              <Upload className="w-6 h-6 text-emerald-400" />
              <div className="text-center">
                <div className="text-white font-medium">Click to upload HAR file</div>
                <div className="text-white/50 text-sm mt-1">or drag and drop</div>
              </div>
            </>
          )}
        </label>
      </div>
      
      <div className="mt-4 text-xs text-white/50">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-3 h-3" />
          <span>What gets extracted:</span>
        </div>
        <ul className="list-disc list-inside space-y-1 ml-5">
          <li>OAuth tokens (access_token, refresh_token, id_token)</li>
          <li>Token endpoints and refresh URLs</li>
          <li>API endpoints and request patterns</li>
          <li>Authentication headers and cookies</li>
        </ul>
      </div>
    </div>
  );
}
