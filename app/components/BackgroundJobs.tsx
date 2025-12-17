'use client';

import { useState, useEffect } from 'react';
import { Loader2, CheckCircle2, XCircle, Clock, Play } from 'lucide-react';

interface JobStatus {
  jobId: string;
  type: 'enrichment' | 'scraping';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: {
    current: number;
    total: number;
    percentage: number;
  };
  startedAt: string;
  completedAt?: string;
  error?: string;
  metadata?: {
    leadCount?: number;
    searchParams?: any;
    [key: string]: any;
  };
}

export default function BackgroundJobs() {
  const [jobs, setJobs] = useState<JobStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchJobs = async () => {
    try {
      const response = await fetch('/api/jobs/status?activeOnly=true');
      const data = await response.json();
      if (data.success) {
        setJobs(data.jobs || []);
      }
    } catch (error) {
      console.error('Error fetching jobs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
    
    if (autoRefresh) {
      const interval = setInterval(fetchJobs, 2000); // Poll every 2 seconds
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const getStatusIcon = (status: JobStatus['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-green-400" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-400" />;
      case 'running':
        return <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />;
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-400" />;
      default:
        return <Clock className="w-4 h-4 text-slate-400" />;
    }
  };

  const getStatusColor = (status: JobStatus['status']) => {
    switch (status) {
      case 'completed':
        return 'text-green-400';
      case 'failed':
        return 'text-red-400';
      case 'running':
        return 'text-blue-400';
      case 'pending':
        return 'text-yellow-400';
      default:
        return 'text-slate-400';
    }
  };

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString();
  };

  if (loading && jobs.length === 0) {
    return (
      <div className="panel-inactive rounded-xl p-4">
        <div className="flex items-center gap-2 text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading jobs...</span>
        </div>
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="panel-inactive rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-200">Background Jobs</h3>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className="text-xs text-slate-400 hover:text-slate-200"
          >
            {autoRefresh ? 'Auto-refresh: ON' : 'Auto-refresh: OFF'}
          </button>
        </div>
        <p className="text-sm text-slate-500">No active background jobs</p>
      </div>
    );
  }

  return (
    <div className="panel-inactive rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-slate-200">Background Jobs ({jobs.length})</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchJobs}
            className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            Refresh
          </button>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`text-xs transition-colors ${
              autoRefresh ? 'text-blue-400' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {autoRefresh ? 'Auto: ON' : 'Auto: OFF'}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {jobs.map((job) => (
          <div
            key={job.jobId}
            className="panel-inactive rounded-lg p-3 space-y-2"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {getStatusIcon(job.status)}
                <span className={`badge text-xs font-medium ${
                  job.status === 'completed' ? 'badge-success' :
                  job.status === 'failed' ? 'badge-error' :
                  job.status === 'running' ? 'badge-processing' :
                  job.status === 'pending' ? 'badge-warning' :
                  'badge-info'
                }`}>
                  {job.status.toUpperCase()}
                </span>
                <span className="text-xs text-slate-500">
                  {job.type === 'enrichment' ? 'Enrichment' : 'Scraping'}
                </span>
              </div>
              <span className="text-xs text-slate-500">
                {formatTime(job.startedAt)}
              </span>
            </div>

            {job.status === 'running' && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">
                    {job.progress.current} / {job.progress.total}
                  </span>
                  <span className="text-slate-400">
                    {job.progress.percentage}%
                  </span>
                </div>
                <div className="w-full progress-bar-container h-1.5">
                  <div
                    className="progress-bar-fill h-full"
                    style={{ width: `${job.progress.percentage}%` }}
                  />
                </div>
              </div>
            )}

            {job.status === 'failed' && job.error && (
              <div className="text-xs text-red-400 status-error rounded p-2">
                Error: {job.error}
              </div>
            )}

            {job.status === 'completed' && job.metadata?.leadCount && (
              <div className="text-xs text-slate-400">
                Completed: {job.metadata.leadCount} leads processed
              </div>
            )}

            {job.metadata?.searchParams && (
              <div className="text-xs text-slate-500 truncate">
                {JSON.stringify(job.metadata.searchParams).substring(0, 50)}...
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
