'use client';

import { useState, useEffect, useRef } from 'react';
import AppLayout from '../components/AppLayout';
import { FileText, Upload, AlertCircle, Loader2, ClipboardList, Linkedin, Globe } from 'lucide-react';
import type { NormalizedWarnRow } from '@/utils/warn';

interface IngestResult {
  fileName: string;
  rows: NormalizedWarnRow[];
  warnings: string[];
  savedPath?: string;
}

interface WarnListEntry {
  filename: string;
  path: string;
  rowCount: number;
  ingestedAt?: string;
}

const PAGE_SIZE = 50;

export default function WarnPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [ingestResult, setIngestResult] = useState<IngestResult[] | null>(null);
  const [totalRows, setTotalRows] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [lists, setLists] = useState<WarnListEntry[]>([]);
  const [loadingLists, setLoadingLists] = useState(true);
  const [loadedRows, setLoadedRows] = useState<NormalizedWarnRow[]>([]);
  const [loadedPath, setLoadedPath] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [scrapeUrl, setScrapeUrl] = useState('');
  const [scraping, setScraping] = useState(false);
  const [scrapeWarnings, setScrapeWarnings] = useState<string[]>([]);
  const [matchLinkedInLoading, setMatchLinkedInLoading] = useState(false);
  const [matchLinkedInMessage, setMatchLinkedInMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadLists();
  }, []);

  const loadLists = async () => {
    try {
      setLoadingLists(true);
      const res = await fetch('/api/warn/lists');
      const data = await res.json();
      if (data.success && data.data) setLists(data.data);
    } catch {
      setLists([]);
    } finally {
      setLoadingLists(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (selected?.length) setFiles(Array.from(selected));
    setError(null);
  };

  const handleUpload = async () => {
    if (files.length === 0) {
      setError('Select one or more CSV or Excel files.');
      return;
    }
    setUploading(true);
    setError(null);
    setIngestResult(null);
    try {
      const form = new FormData();
      files.forEach((f) => form.append('files', f));
      const res = await fetch('/api/warn/ingest', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      if (!data.success) throw new Error(data.error || 'Ingest failed');
      setIngestResult(data.data || []);
      setTotalRows(data.totalRows ?? 0);
      const allRows: NormalizedWarnRow[] = (data.data || []).flatMap((d: IngestResult) => d.rows);
      setLoadedRows(allRows);
      setLoadedPath(data.savedPath ?? null);
      setPage(0);
      loadLists();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleScrape = async () => {
    const url = scrapeUrl.trim();
    if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
      setError('Enter a valid URL (http or https).');
      return;
    }
    setScraping(true);
    setError(null);
    setScrapeWarnings([]);
    setIngestResult(null);
    try {
      const res = await fetch('/api/warn/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Scrape failed');
      if (!data.success) throw new Error(data.error || 'Scrape failed');
      setLoadedRows(data.rows ?? []);
      setLoadedPath(data.savedPath ?? null);
      setTotalRows(data.totalRows ?? 0);
      if (data.warnings?.length) setScrapeWarnings(data.warnings);
      setPage(0);
      loadLists();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scrape failed');
    } finally {
      setScraping(false);
    }
  };

  const loadSavedList = async (path: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/warn/load?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Load failed');
      setLoadedRows(data.data?.rows ?? []);
      setLoadedPath(path);
      setPage(0);
      setIngestResult(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Load failed');
    }
  };

  const displayRows = loadedRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(loadedRows.length / PAGE_SIZE) || 1;

  return (
    <AppLayout>
      <div className="p-6 flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <ClipboardList className="w-8 h-8" style={{ color: '#ff5757' }} />
          <div>
            <h1 className="text-2xl font-bold text-white">WARN Lists</h1>
            <p className="text-sm text-slate-400">
              Upload state WARN layoff lists (CSV or Excel), then match companies to LinkedIn and extract employees.
            </p>
          </div>
        </div>

        {/* Upload */}
        <div className="rounded-lg border border-white/10 bg-black/20 p-4">
          <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
            <Upload className="w-5 h-5" style={{ color: '#ff5757' }} />
            Upload WARN list(s)
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xls,.xlsx,.xlsm"
              multiple
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 rounded-lg border border-white/20 bg-white/5 text-white hover:bg-white/10 text-sm"
            >
              Choose files
            </button>
            {files.length > 0 && (
              <span className="text-slate-400 text-sm">
                {files.length} file(s): {files.map((f) => f.name).join(', ')}
              </span>
            )}
            <button
              type="button"
              onClick={handleUpload}
              disabled={uploading || files.length === 0}
              className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50 flex items-center gap-2"
              style={{ background: '#ff5757' }}
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              {uploading ? 'Ingesting…' : 'Upload & ingest'}
            </button>
          </div>
          <p className="text-slate-500 text-xs mt-2">
            Supported: CSV, XLS, XLSX. Max 20MB total. Texas, Michigan, and FL/TN formats are auto-detected.
          </p>
        </div>

        {/* Scrape from URL */}
        <div className="rounded-lg border border-white/10 bg-black/20 p-4">
          <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
            <Globe className="w-5 h-5" style={{ color: '#ff5757' }} />
            Scrape WARN from URL
          </h2>
          <p className="text-slate-400 text-sm mb-3">
            Scrape a state WARN or layoff notice page with Scrapegraph (runs locally; may take a minute).
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="url"
              value={scrapeUrl}
              onChange={(e) => setScrapeUrl(e.target.value)}
              placeholder="https://..."
              className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-white/20 bg-white/5 text-white placeholder-slate-500 text-sm"
            />
            <button
              type="button"
              onClick={handleScrape}
              disabled={scraping || !scrapeUrl.trim()}
              className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50 flex items-center gap-2"
              style={{ background: '#ff5757' }}
            >
              {scraping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
              {scraping ? 'Scraping…' : 'Scrape with Scrapegraph'}
            </button>
          </div>
          {scraping && (
            <p className="text-slate-500 text-xs mt-2">Scraping… this may take a minute.</p>
          )}
          {scrapeWarnings.length > 0 && (
            <p className="text-amber-400 text-xs mt-2">{scrapeWarnings.join(' ')}</p>
          )}
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-900/20 p-4 flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}

        {/* Ingest result summary */}
        {ingestResult && ingestResult.length > 0 && (
          <div className="rounded-lg border border-white/10 bg-black/20 p-4">
            <h2 className="text-lg font-semibold text-white mb-2">Last ingest</h2>
            <ul className="text-slate-300 text-sm space-y-1">
              {ingestResult.map((r) => (
                <li key={r.fileName}>
                  {r.fileName}: {r.rows.length} rows
                  {r.warnings.length > 0 && (
                    <span className="text-amber-400 ml-2">({r.warnings.join('; ')})</span>
                  )}
                </li>
              ))}
            </ul>
            <p className="text-slate-400 text-sm mt-2">Total: {totalRows} rows saved.</p>
          </div>
        )}

        {/* Previously ingested */}
        <div className="rounded-lg border border-white/10 bg-black/20 p-4">
          <h2 className="text-lg font-semibold text-white mb-3">Previously ingested</h2>
          {loadingLists ? (
            <p className="text-slate-400 text-sm">Loading…</p>
          ) : lists.length === 0 ? (
            <p className="text-slate-500 text-sm">No saved WARN datasets yet. Upload files above.</p>
          ) : (
            <ul className="space-y-2">
              {lists.map((entry) => (
                <li key={entry.filename}>
                  <button
                    type="button"
                    onClick={() => loadSavedList(entry.path)}
                    className="text-left w-full px-3 py-2 rounded-lg border border-white/10 bg-white/5 text-white hover:bg-white/10 text-sm flex justify-between items-center"
                  >
                    <span>{entry.filename}</span>
                    <span className="text-slate-400">{entry.rowCount} rows</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Preview table */}
        {loadedRows.length > 0 && (
          <div className="rounded-lg border border-white/10 bg-black/20 p-4 overflow-hidden">
            <h2 className="text-lg font-semibold text-white mb-3">
              Preview {loadedPath ? `(${loadedPath})` : ''}
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-white/10 text-slate-400">
                    <th className="py-2 pr-4">Company</th>
                    <th className="py-2 pr-4">City</th>
                    <th className="py-2 pr-4">State/County</th>
                    <th className="py-2 pr-4 text-right">Layoffs</th>
                    <th className="py-2 pr-4">Layoff date</th>
                    <th className="py-2">Notice date</th>
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((row, i) => (
                    <tr key={i} className="border-b border-white/5 text-slate-300">
                      <td className="py-2 pr-4 font-medium text-white">{row.companyName}</td>
                      <td className="py-2 pr-4">{row.city}</td>
                      <td className="py-2 pr-4">{row.stateOrCounty}</td>
                      <td className="py-2 pr-4 text-right">{row.layoffCount}</td>
                      <td className="py-2 pr-4">{row.layoffDate ?? '—'}</td>
                      <td className="py-2">{row.noticeDate ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-3 text-slate-400 text-sm">
                <span>
                  Page {page + 1} of {totalPages} ({loadedRows.length} rows)
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="px-3 py-1 rounded border border-white/10 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    className="px-3 py-1 rounded border border-white/10 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Match to LinkedIn & extract employees */}
        <div className="rounded-lg border border-white/10 bg-black/20 p-4">
          <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
            <Linkedin className="w-5 h-5" style={{ color: '#ff5757' }} />
            Next step
          </h2>
          <p className="text-slate-400 text-sm mb-3">
            Match companies to LinkedIn and fetch employees for the current list. Results appear in Scrape History and can be enriched.
          </p>
          {matchLinkedInMessage && (
            <p
              className={
                matchLinkedInMessage.startsWith('Job started')
                  ? 'text-sm mb-3 text-emerald-400'
                  : 'text-sm mb-3 text-amber-400'
              }
            >
              {matchLinkedInMessage}
            </p>
          )}
          <button
            type="button"
            disabled={loadedRows.length === 0 || matchLinkedInLoading}
            onClick={async () => {
              if (loadedRows.length === 0) return;
              setMatchLinkedInMessage(null);
              setMatchLinkedInLoading(true);
              try {
                const res = await fetch('/api/warn/match-linkedin', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ rows: loadedRows, maxCompanies: 20 }),
                });
                const data = await res.json();
                if (!res.ok) {
                  setMatchLinkedInMessage(data?.error ?? 'Request failed');
                  return;
                }
                setMatchLinkedInMessage(
                  `Job started. Monitor progress in Background Jobs. (Job ID: ${data.jobId})`
                );
              } catch (e) {
                setMatchLinkedInMessage(e instanceof Error ? e.message : 'Request failed');
              } finally {
                setMatchLinkedInLoading(false);
              }
            }}
            className="px-4 py-2 rounded-lg border border-white/20 bg-white/10 text-white text-sm hover:bg-white/15 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {matchLinkedInLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Match to LinkedIn & extract employees
          </button>
        </div>
      </div>
    </AppLayout>
  );
}
