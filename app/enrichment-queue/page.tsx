'use client';

import { useState, useEffect } from 'react';
import { Loader2, AlertCircle, Sparkles } from 'lucide-react';
import AppLayout from '../components/AppLayout';

interface UnenrichedLead {
  fullName?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  company?: string;
  location?: string;
  navigationUrl?: string;
  linkedin_url?: string;
  profile_url?: string;
  url?: string;
  email?: string;
  _sourceFile?: string;
  _sourceTimestamp?: string;
  _searchParams?: any;
}

export default function EnrichmentQueuePage() {
  const [leads, setLeads] = useState<UnenrichedLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadUnenrichedLeads();
  }, []);

  const loadUnenrichedLeads = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/load-unenriched-leads');
      const data = await response.json();

      if (data.success) {
        setLeads(data.leads || []);
      } else {
        setError(data.error || 'Failed to load unenriched leads');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout>
      <div className="w-full px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent tracking-tight drop-shadow-lg">
              Enrichment Queue
            </h1>
            <p className="text-slate-400 mt-2 font-data">
              Leads that have been scraped but not yet enriched
            </p>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
            <span className="ml-3 text-slate-400">Loading unenriched leads...</span>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-900/20 backdrop-blur-sm border border-red-500/50 rounded-xl shadow-xl p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <div>
              <p className="text-red-400 font-medium">Error loading leads</p>
              <p className="text-red-300/80 text-sm mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Leads Table */}
        {!loading && !error && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-200 font-data">
                Unenriched Leads ({leads.length})
              </h2>
              <button
                onClick={loadUnenrichedLeads}
                className="px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-lg hover:shadow-lg hover:shadow-blue-500/50 transition-all duration-300 text-sm font-medium"
              >
                Refresh
              </button>
            </div>

            {leads.length === 0 ? (
              <div className="p-12 text-center bg-slate-800/60 backdrop-blur-xl rounded-xl border border-slate-700/50">
                <Sparkles className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                <p className="text-slate-400 text-lg">No unenriched leads found</p>
                <p className="text-slate-500 text-sm mt-2">
                  All scraped leads have been enriched, or no leads have been scraped yet.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-700/50 bg-gradient-to-br from-slate-900/50 via-slate-800/50 to-slate-900/50 backdrop-blur-xl shadow-2xl shadow-blue-500/10 relative">
                {/* Animated gradient border */}
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-pink-500/20 opacity-50 blur-xl animate-pulse pointer-events-none" />
                <div className="relative z-10">
                  <table className="w-full text-xs relative z-10 font-data" style={{ tableLayout: 'fixed', width: '100%' }}>
                    <thead>
                      <tr className="border-b border-gradient-to-r from-blue-500/30 via-purple-500/30 to-pink-500/30 bg-gradient-to-r from-slate-800/80 to-slate-700/80 backdrop-blur-sm">
                        <th className="px-2 py-2 text-left text-blue-400 font-semibold text-[10px] uppercase tracking-wider" style={{ width: '15%' }}>Name</th>
                        <th className="px-2 py-2 text-left text-blue-400 font-semibold text-[10px] uppercase tracking-wider" style={{ width: '15%' }}>Title</th>
                        <th className="px-2 py-2 text-left text-blue-400 font-semibold text-[10px] uppercase tracking-wider" style={{ width: '15%' }}>Company</th>
                        <th className="px-2 py-2 text-left text-blue-400 font-semibold text-[10px] uppercase tracking-wider" style={{ width: '12%' }}>Location</th>
                        <th className="px-2 py-2 text-left text-blue-400 font-semibold text-[10px] uppercase tracking-wider" style={{ width: '18%' }}>Email</th>
                        <th className="px-2 py-2 text-left text-blue-400 font-semibold text-[10px] uppercase tracking-wider" style={{ width: '15%' }}>LinkedIn</th>
                        <th className="px-2 py-2 text-left text-blue-400 font-semibold text-[10px] uppercase tracking-wider" style={{ width: '10%' }}>Scraped</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/30">
                      {leads.map((lead, idx) => {
                        const name = lead.fullName || lead.name || `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || 'Unknown';
                        const linkedinUrl = lead.navigationUrl || lead.linkedin_url || lead.profile_url || lead.url;
                        const scrapedDate = lead._sourceTimestamp 
                          ? new Date(lead._sourceTimestamp).toLocaleDateString()
                          : 'Unknown';

                        return (
                          <tr 
                            key={idx} 
                            className="group relative border-b border-slate-700/20 hover:border-blue-500/30 transition-all duration-500 ease-out hover:bg-gradient-to-r hover:from-slate-800/60 hover:via-slate-700/40 hover:to-slate-800/60 backdrop-blur-sm"
                          >
                            <td className="px-2 py-2 text-slate-100 font-semibold relative z-10">
                              {name}
                            </td>
                            <td className="px-2 py-2 text-slate-200 whitespace-nowrap">
                              {lead.title || '-'}
                            </td>
                            <td className="px-2 py-2 text-slate-200 whitespace-nowrap">
                              {lead.company || '-'}
                            </td>
                            <td className="px-2 py-2 text-slate-200 whitespace-nowrap">
                              {lead.location || '-'}
                            </td>
                            <td className="px-2 py-2 text-slate-200 whitespace-nowrap">
                              {lead.email || '-'}
                            </td>
                            <td className="px-2 py-2 text-slate-200 whitespace-nowrap">
                              {linkedinUrl ? (
                                <a
                                  href={linkedinUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-400 hover:text-blue-300 underline transition-colors"
                                >
                                  View Profile
                                </a>
                              ) : (
                                <span className="text-slate-500">-</span>
                              )}
                            </td>
                            <td className="px-2 py-2 text-slate-300 whitespace-nowrap text-[10px]">
                              {scrapedDate}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
