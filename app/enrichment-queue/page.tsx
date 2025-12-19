'use client';

import { useState, useEffect, useMemo } from 'react';
import { Loader2, Download, ArrowUpDown, ArrowUp, ArrowDown, Search, FileJson, FileSpreadsheet, Calendar, MapPin, Briefcase, Building2, Filter } from 'lucide-react';
import AppLayout from '../components/AppLayout';

interface ScrapeHistoryItem {
  filename: string;
  timestamp: string;
  date: string;
  time: string;
  leadCount: number;
  location?: string;
  state?: string;
  keywords?: string;
  jobTitle?: string;
  company?: string;
  filters: string[];
  endpoint: string;
  hasPagination: boolean;
  totalAvailable?: number;
}

type SortField = 'date' | 'leadCount' | 'state' | 'location' | 'none';
type SortDirection = 'asc' | 'desc';

export default function ScrapeHistoryPage() {
  const [scrapes, setScrapes] = useState<ScrapeHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    loadScrapeHistory();
  }, []);

  const loadScrapeHistory = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/scrape-history');
      const data = await response.json();

      if (data.success) {
        setScrapes(data.scrapes || []);
      } else {
        setError(data.error || 'Failed to load scrape history');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const handleDownload = async (filename: string, format: 'json' | 'csv') => {
    try {
      setDownloading(filename);
      const response = await fetch(`/api/scrape-history/download?filename=${encodeURIComponent(filename)}&format=${format}`);
      
      if (!response.ok) {
        throw new Error('Download failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename.replace('.json', format === 'csv' ? '.csv' : '.json');
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      alert(`Failed to download: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setDownloading(null);
    }
  };

  const sortedAndFilteredScrapes = useMemo(() => {
    let filtered = scrapes;

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(scrape =>
        scrape.location?.toLowerCase().includes(query) ||
        scrape.state?.toLowerCase().includes(query) ||
        scrape.keywords?.toLowerCase().includes(query) ||
        scrape.jobTitle?.toLowerCase().includes(query) ||
        scrape.company?.toLowerCase().includes(query) ||
        scrape.date.toLowerCase().includes(query)
      );
    }

    // Apply sorting
    if (sortField === 'none') return filtered;

    const sorted = [...filtered].sort((a, b) => {
      let aVal: any;
      let bVal: any;

      switch (sortField) {
        case 'date':
          aVal = new Date(a.timestamp).getTime();
          bVal = new Date(b.timestamp).getTime();
          break;
        case 'leadCount':
          aVal = a.leadCount;
          bVal = b.leadCount;
          break;
        case 'state':
          aVal = a.state || '';
          bVal = b.state || '';
          break;
        case 'location':
          aVal = a.location || '';
          bVal = b.location || '';
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [scrapes, sortField, sortDirection, searchQuery]);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 ml-1 opacity-50" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-3 h-3 ml-1" />
    ) : (
      <ArrowDown className="w-3 h-3 ml-1" />
    );
  };

  return (
    <AppLayout>
      <div className="w-full px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent tracking-tight drop-shadow-lg">
              Scrape History
            </h1>
            <p className="text-slate-400 mt-2 font-data">
              View and download all historical scraped lead lists
            </p>
          </div>
          <button
            onClick={loadScrapeHistory}
            disabled={loading}
            className="px-4 py-2 btn-active text-white rounded-lg state-transition text-sm font-medium disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Refresh'}
          </button>
        </div>

        {/* Search and Stats */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by location, state, keywords, job title, company, or date..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div className="text-sm text-slate-400 font-data">
            {sortedAndFilteredScrapes.length} of {scrapes.length} scrapes
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
            <span className="ml-3 text-slate-400">Loading scrape history...</span>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-900/20 backdrop-blur-sm border border-red-500/50 rounded-xl shadow-xl p-4">
            <p className="text-red-400 font-medium">Error loading scrape history</p>
            <p className="text-red-300/80 text-sm mt-1">{error}</p>
          </div>
        )}

        {/* Scrapes Table */}
        {!loading && !error && (
          <div className="overflow-x-auto rounded-2xl panel-inactive">
            {sortedAndFilteredScrapes.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-slate-400 text-lg">No scrapes found</p>
                <p className="text-slate-500 text-sm mt-2">
                  {searchQuery ? 'Try adjusting your search query' : 'Start scraping leads to see them here'}
                </p>
              </div>
            ) : (
              <table className="w-full text-xs font-data">
                <thead>
                  <tr className="table-header">
                    <th 
                      className="px-4 py-3 text-left text-blue-400 font-semibold text-[10px] uppercase tracking-wider cursor-pointer hover:text-blue-300"
                      onClick={() => handleSort('date')}
                    >
                      <div className="flex items-center">
                        Date & Time
                        <SortIcon field="date" />
                      </div>
                    </th>
                    <th 
                      className="px-4 py-3 text-left text-blue-400 font-semibold text-[10px] uppercase tracking-wider cursor-pointer hover:text-blue-300"
                      onClick={() => handleSort('leadCount')}
                    >
                      <div className="flex items-center">
                        Leads
                        <SortIcon field="leadCount" />
                      </div>
                    </th>
                    <th 
                      className="px-4 py-3 text-left text-blue-400 font-semibold text-[10px] uppercase tracking-wider cursor-pointer hover:text-blue-300"
                      onClick={() => handleSort('state')}
                    >
                      <div className="flex items-center">
                        State
                        <SortIcon field="state" />
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left text-blue-400 font-semibold text-[10px] uppercase tracking-wider">
                      Location
                    </th>
                    <th className="px-4 py-3 text-left text-blue-400 font-semibold text-[10px] uppercase tracking-wider">
                      Filters
                    </th>
                    <th className="px-4 py-3 text-left text-blue-400 font-semibold text-[10px] uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/30">
                  {sortedAndFilteredScrapes.map((scrape) => (
                    <tr key={scrape.filename} className="table-row-inactive hover:bg-slate-800/30">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          <div>
                            <div className="text-slate-100 font-medium">{scrape.date}</div>
                            <div className="text-slate-400 text-[10px]">{scrape.time}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-slate-200 font-semibold">{scrape.leadCount.toLocaleString()}</div>
                        {scrape.totalAvailable && scrape.totalAvailable > scrape.leadCount && (
                          <div className="text-slate-400 text-[10px]">
                            of {scrape.totalAvailable.toLocaleString()} available
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {scrape.state ? (
                          <span className="px-2 py-1 bg-blue-900/30 text-blue-300 rounded text-[10px] font-medium">
                            {scrape.state}
                          </span>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {scrape.location ? (
                          <div className="flex items-center gap-1 text-slate-200">
                            <MapPin className="w-3 h-3 text-slate-400" />
                            <span className="truncate max-w-[150px]" title={scrape.location}>
                              {scrape.location}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {scrape.jobTitle && (
                            <span className="flex items-center gap-1 px-2 py-1 bg-purple-900/30 text-purple-300 rounded text-[10px]">
                              <Briefcase className="w-3 h-3" />
                              {scrape.jobTitle}
                            </span>
                          )}
                          {scrape.company && (
                            <span className="flex items-center gap-1 px-2 py-1 bg-green-900/30 text-green-300 rounded text-[10px]">
                              <Building2 className="w-3 h-3" />
                              {scrape.company}
                            </span>
                          )}
                          {scrape.keywords && (
                            <span className="px-2 py-1 bg-slate-700/50 text-slate-300 rounded text-[10px]">
                              {scrape.keywords}
                            </span>
                          )}
                          {scrape.filters.length > 0 && (
                            <span className="flex items-center gap-1 px-2 py-1 bg-orange-900/30 text-orange-300 rounded text-[10px]">
                              <Filter className="w-3 h-3" />
                              {scrape.filters.length} filter{scrape.filters.length !== 1 ? 's' : ''}
                            </span>
                          )}
                          {!scrape.jobTitle && !scrape.company && !scrape.keywords && scrape.filters.length === 0 && (
                            <span className="text-slate-500 text-[10px]">-</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleDownload(scrape.filename, 'csv')}
                            disabled={downloading === scrape.filename}
                            className="p-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-900/20 rounded state-transition disabled:opacity-50"
                            title="Download as CSV"
                          >
                            {downloading === scrape.filename ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <FileSpreadsheet className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            onClick={() => handleDownload(scrape.filename, 'json')}
                            disabled={downloading === scrape.filename}
                            className="p-1.5 text-purple-400 hover:text-purple-300 hover:bg-purple-900/20 rounded state-transition disabled:opacity-50"
                            title="Download as JSON"
                          >
                            {downloading === scrape.filename ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <FileJson className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

