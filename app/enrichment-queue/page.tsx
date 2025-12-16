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
            <p className="text-slate-400 mt-2">
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
          <div className="bg-slate-800/60 backdrop-blur-xl border border-slate-700/50 rounded-xl shadow-xl overflow-hidden">
            <div className="p-4 border-b border-slate-700/50">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-200">
                  Unenriched Leads ({leads.length})
                </h2>
                <button
                  onClick={loadUnenrichedLeads}
                  className="px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-lg hover:shadow-lg hover:shadow-blue-500/50 transition-all duration-300 text-sm font-medium"
                >
                  Refresh
                </button>
              </div>
            </div>

            {leads.length === 0 ? (
              <div className="p-12 text-center">
                <Sparkles className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                <p className="text-slate-400 text-lg">No unenriched leads found</p>
                <p className="text-slate-500 text-sm mt-2">
                  All scraped leads have been enriched, or no leads have been scraped yet.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-900/60">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                        Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                        Title
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                        Company
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                        Location
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                        Email
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                        LinkedIn
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                        Scraped
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {leads.map((lead, idx) => {
                      const name = lead.fullName || lead.name || `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || 'Unknown';
                      const linkedinUrl = lead.navigationUrl || lead.linkedin_url || lead.profile_url || lead.url;
                      const scrapedDate = lead._sourceTimestamp 
                        ? new Date(lead._sourceTimestamp).toLocaleDateString()
                        : 'Unknown';

                      return (
                        <tr key={idx} className="hover:bg-slate-700/30 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-200">
                            {name}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">
                            {lead.title || '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">
                            {lead.company || '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">
                            {lead.location || '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">
                            {lead.email || '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            {linkedinUrl ? (
                              <a
                                href={linkedinUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-400 hover:text-blue-300 underline"
                              >
                                View Profile
                              </a>
                            ) : (
                              <span className="text-slate-500">-</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">
                            {scrapedDate}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
