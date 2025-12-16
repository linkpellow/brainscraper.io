'use client';

import { useState, useEffect } from 'react';
import LoadingSpinner from './LoadingSpinner';

export interface DNCResult {
  phone: string;
  isDoNotCall: boolean;
  canContact: boolean;
  reason?: string;
}

interface USHAScrubberProps {
  file: File;
  onScrubComplete?: (jobLogID: string) => void;
  onScrubResults?: (results: DNCResult[]) => void;
}

export default function USHAScrubber({ file, onScrubComplete, onScrubResults }: USHAScrubberProps) {
  const [token, setToken] = useState<string>('');
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobLogID, setJobLogID] = useState<string | null>(null);
  const [scrubResults, setScrubResults] = useState<unknown[] | null>(null);
  const [isCheckingResults, setIsCheckingResults] = useState(false);
  
  // Single phone test state
  const [testPhone, setTestPhone] = useState<string>('');
  const [isTestingPhone, setIsTestingPhone] = useState(false);
  const [phoneTestResult, setPhoneTestResult] = useState<DNCResult | null>(null);
  const [extensionAvailable, setExtensionAvailable] = useState<boolean>(false);

  // Attempt to get token from Chrome extension on mount
  useEffect(() => {
    const tryGetExtensionToken = async () => {
      // Check if Chrome extension APIs are available
      if (typeof window !== 'undefined') {
        const chrome = (window as any).chrome;
        if (chrome && chrome.runtime && chrome.runtime.id) {
          try {
            // Try to get token from extension storage
            if (chrome.storage && chrome.storage.local) {
              chrome.storage.local.get(['ushaJWTToken'], (result: any) => {
                if (result && result.ushaJWTToken) {
                  setToken(result.ushaJWTToken);
                  setExtensionAvailable(true);
                }
              });
            }

            // Also try message API as fallback
            if (chrome.runtime.sendMessage) {
              chrome.runtime.sendMessage(
                chrome.runtime.id,
                { action: 'getToken' },
                (response: any) => {
                  if (response && response.token && !token) {
                    setToken(response.token);
                    setExtensionAvailable(true);
                  }
                }
              );
            }
          } catch (error) {
            // Extension not available or error accessing it
            console.log('Extension token not available:', error);
          }
        }
      }
    };

    tryGetExtensionToken();
  }, []);

  const handleScrub = async () => {
    if (!token.trim()) {
      setError('USHA JWT token is required');
      return;
    }

    setIsScrubbing(true);
    setError(null);
    setJobLogID(null);
    setScrubResults(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('token', token);
      formData.append('ScrubList', 'true');
      formData.append('ImportLeads', 'false');

      const response = await fetch('/api/usha/scrub', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to scrub leads');
      }

      // Extract JobLogID from response (adjust based on actual API response structure)
      const jobId = result.data?.JobLogID || result.data?.jobLogID || result.data?.id;
      if (jobId) {
        setJobLogID(String(jobId));
        if (onScrubComplete) {
          onScrubComplete(String(jobId));
        }
      } else {
        setError('Upload successful but JobLogID not found in response');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsScrubbing(false);
    }
  };

  const handleCheckResults = async () => {
    if (!jobLogID) return;

    setIsCheckingResults(true);
    setError(null);

    try {
      const response = await fetch(`/api/usha/import-log?JobLogID=${jobLogID}&token=${encodeURIComponent(token)}`);

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch scrub results');
      }

      const results = result.data || [];
      setScrubResults(results);
      
      // Convert to DNCResult format and notify parent
      if (onScrubResults && Array.isArray(results)) {
        const dncResults: DNCResult[] = results.map((r: any) => ({
          phone: String(r.phoneNumber || r.PhoneNumber || ''),
          isDoNotCall: Boolean(r.isDoNotCall || r.IsDoNotCall),
          canContact: Boolean(r.canContact || r.CanContact),
          reason: r.reason || r.Reason || undefined,
        })).filter((r: DNCResult) => r.phone); // Only include results with phone numbers
        
        onScrubResults(dncResults);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsCheckingResults(false);
    }
  };

  const handleTestSinglePhone = async () => {
    if (!token.trim()) {
      setError('USHA JWT token is required');
      return;
    }

    if (!testPhone.trim()) {
      setError('Phone number is required');
      return;
    }

    setIsTestingPhone(true);
    setError(null);
    setPhoneTestResult(null);

    try {
      const cleanedPhone = testPhone.replace(/\D/g, '');
      if (cleanedPhone.length < 10) {
        throw new Error('Invalid phone number format');
      }

      const response = await fetch(`/api/usha/scrub-phone?phone=${encodeURIComponent(cleanedPhone)}&token=${encodeURIComponent(token)}`);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to test phone number');
      }

      // Convert API response to DNCResult format
      const dncResult: DNCResult = {
        phone: result.phone || cleanedPhone,
        isDoNotCall: result.isDNC === true || result.data?.isDNC === true || result.data?.isDoNotCall === true,
        canContact: result.data?.canContact !== false && (result.isDNC !== true && result.data?.isDNC !== true),
        reason: result.data?.reason || result.reason || (result.isDNC ? 'Phone number is on DNC list' : undefined),
      };

      setPhoneTestResult(dncResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsTestingPhone(false);
    }
  };

  return (
    <div className="w-full space-y-4">
      <div className="terminal-border p-6 bg-hacker-bg-tertiary/60">
        <h3 className="text-hacker-text-primary terminal-glow-sm text-lg mb-4">
          &gt; USHA DNC Lead Scrubbing
        </h3>
        
        <div className="space-y-3">
          <div>
            <label className="block text-hacker-text-primary-dim text-sm mb-2">
              USHA JWT Token:
            </label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Enter your USHA JWT token"
              className="w-full terminal-border p-2 bg-hacker-bg-tertiary/60 text-hacker-text-primary focus:outline-none focus:ring-2 focus:ring-hacker-cyan focus:ring-offset-2 focus:ring-offset-hacker-bg"
            />
            <p className="text-hacker-text-primary-dim text-xs mt-1">
              {extensionAvailable ? (
                <span className="text-hacker-green">✓ Token loaded from Chrome extension</span>
              ) : (
                <>
              Token will be used for this session only. Add USHA_JWT_TOKEN to .env.local for persistent use.
                  {typeof window !== 'undefined' && (window as any).chrome && (window as any).chrome.runtime && (
                    <span className="block mt-1 text-hacker-cyan">💡 Install USHA DNC extension to auto-load token</span>
                  )}
                </>
              )}
            </p>
          </div>

          {/* Single Phone Test Section */}
          <div className="terminal-border p-4 bg-hacker-bg-tertiary/40 space-y-3">
            <h4 className="text-hacker-text-primary text-sm font-bold">
              &gt; Test Single Phone Number
            </h4>
            <div className="flex gap-2">
              <input
                type="text"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="Enter phone number (e.g., 2694621403)"
                className="flex-1 terminal-border p-2 bg-hacker-bg-tertiary/60 text-hacker-text-primary focus:outline-none focus:ring-2 focus:ring-hacker-cyan focus:ring-offset-2 focus:ring-offset-hacker-bg"
              />
              <button
                onClick={handleTestSinglePhone}
                disabled={isTestingPhone || !token.trim() || !testPhone.trim()}
                className="terminal-border px-4 py-2 bg-hacker-bg-tertiary/60 hover:bg-hacker-bg-tertiary/80 hover:border-hacker-cyan transition-all text-hacker-text-primary terminal-glow-sm focus:outline-none focus:ring-2 focus:ring-hacker-cyan focus:ring-offset-2 focus:ring-offset-hacker-bg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isTestingPhone ? 'Testing...' : 'Test DNC'}
              </button>
            </div>
            {phoneTestResult && (
              <div className="terminal-border p-3 bg-hacker-bg-tertiary/80">
                <p className="text-hacker-text-primary text-sm font-bold mb-2">
                  &gt; Test Result:
                </p>
                <div className="space-y-1 text-xs font-mono">
                  <p className="text-hacker-text-primary">
                    Phone: <span className="text-hacker-cyan">{phoneTestResult.phone}</span>
                  </p>
                  <p className="text-hacker-text-primary">
                    DNC Status: {phoneTestResult.isDoNotCall ? (
                      <span className="text-red-400">?? DO NOT CALL</span>
                    ) : (
                      <span className="text-hacker-green">?? OK TO CALL</span>
                    )}
                  </p>
                  <p className="text-hacker-text-primary">
                    Can Contact: {phoneTestResult.canContact ? (
                      <span className="text-hacker-green">? YES</span>
                    ) : (
                      <span className="text-red-400">? NO</span>
                    )}
                  </p>
                  {phoneTestResult.reason && (
                    <p className="text-hacker-text-primary-dim">
                      Reason: {phoneTestResult.reason}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-hacker-cyan/20 pt-3">
          <button
            onClick={handleScrub}
            disabled={isScrubbing || !token.trim()}
            className="terminal-border px-6 py-3 bg-hacker-bg-tertiary/60 hover:bg-hacker-bg-tertiary/80 hover:border-hacker-cyan transition-all text-hacker-text-primary terminal-glow-sm focus:outline-none focus:ring-2 focus:ring-hacker-cyan focus:ring-offset-2 focus:ring-offset-hacker-bg disabled:opacity-50 disabled:cursor-not-allowed w-full"
          >
            {isScrubbing ? 'Scrubbing Leads...' : 'Scrub Leads for DNC Status'}
          </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 terminal-border p-3 bg-red-900/20 border-red-500/50">
            <p className="text-red-400 text-sm">
              &gt; ERROR: {error}
            </p>
          </div>
        )}

        {jobLogID && (
          <div className="mt-4 terminal-border p-3 bg-hacker-bg-tertiary/80">
            <p className="text-hacker-text-primary text-sm mb-2">
              &gt; Upload Successful!
            </p>
            <p className="text-hacker-text-primary-dim text-xs mb-3">
              Job Log ID: {jobLogID}
            </p>
            <div className="space-y-2">
              <button
                onClick={handleCheckResults}
                disabled={isCheckingResults}
                className="terminal-border px-4 py-2 bg-hacker-bg-tertiary/60 hover:bg-hacker-bg-tertiary/80 hover:border-hacker-cyan transition-all text-hacker-text-primary terminal-glow-sm focus:outline-none focus:ring-2 focus:ring-hacker-cyan focus:ring-offset-2 focus:ring-offset-hacker-bg disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                {isCheckingResults ? 'Checking...' : 'Check Scrub Results & Update Summary'}
              </button>
              <p className="text-hacker-text-primary-dim text-xs">
                Click to fetch DNC results. Once loaded, DNC status will automatically appear in the Summary View.
              </p>
            </div>
          </div>
        )}

        {scrubResults && (
          <div className="mt-4 terminal-border p-4 bg-hacker-bg-tertiary/80">
            <p className="text-hacker-text-primary text-sm font-bold mb-2">
              &gt; Scrub Results ({scrubResults.length} leads):
            </p>
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-xs font-mono">
                <thead className="bg-hacker-bg-tertiary/60 sticky top-0">
                  <tr>
                    <th className="border border-hacker-cyan/30 px-2 py-1 text-left text-hacker-text-primary">Phone</th>
                    <th className="border border-hacker-cyan/30 px-2 py-1 text-left text-hacker-text-primary">DNC</th>
                    <th className="border border-hacker-cyan/30 px-2 py-1 text-left text-hacker-text-primary">Can Contact</th>
                    <th className="border border-hacker-cyan/30 px-2 py-1 text-left text-hacker-text-primary">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {scrubResults.map((result: any, index: number) => (
                    <tr key={index} className="hover:bg-hacker-green-glow/10">
                      <td className="border border-hacker-cyan/30 px-2 py-1 text-hacker-text-primary">
                        {result.phoneNumber || result.PhoneNumber || 'N/A'}
                      </td>
                      <td className="border border-hacker-cyan/30 px-2 py-1 text-hacker-text-primary">
                        {result.isDoNotCall || result.IsDoNotCall ? (
                          <span className="text-red-400">YES</span>
                        ) : (
                          <span className="text-hacker-text-primary">NO</span>
                        )}
                      </td>
                      <td className="border border-hacker-cyan/30 px-2 py-1 text-hacker-text-primary">
                        {result.canContact || result.CanContact ? (
                          <span className="text-hacker-text-primary">YES</span>
                        ) : (
                          <span className="text-red-400">NO</span>
                        )}
                      </td>
                      <td className="border border-hacker-cyan/30 px-2 py-1 text-hacker-text-primary-dim text-xs">
                        {result.reason || result.Reason || 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

