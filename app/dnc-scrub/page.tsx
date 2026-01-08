'use client';

import { useState } from 'react';

export default function DNCScrubPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError('');
      setProgress('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Please select a CSV file');
      return;
    }

    setLoading(true);
    setError('');
    setProgress('Uploading file...');

    try {
      const formData = new FormData();
      formData.append('file', file);

      setProgress('Processing CSV and scrubbing phone numbers...');

      const response = await fetch('/api/usha/scrub-csv', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Server error: ${response.statusText}`);
      }

      setProgress('Downloading clean leads CSV...');

      // Download the CSV file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `clean_leads_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setProgress('✅ Complete! Clean leads CSV downloaded.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setProgress('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-2">DNC Scrubbing Tool</h1>
        <p className="text-gray-300 mb-8">Upload a CSV file to scrub phone numbers and filter out DNC leads</p>

        <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6 border border-white/20">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                CSV File
              </label>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="block w-full text-sm text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-700"
                disabled={loading}
              />
              <p className="mt-2 text-xs text-gray-400">
                Maximum file size: 10MB. For large files, processing may take several minutes.
              </p>
            </div>

            {error && (
              <div className="bg-red-500/20 border border-red-500 rounded-lg p-4 text-red-200">
                {error}
              </div>
            )}

            {progress && (
              <div className="bg-blue-500/20 border border-blue-500 rounded-lg p-4 text-blue-200">
                {progress}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !file}
              className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              {loading ? 'Processing...' : 'Scrub & Download Clean Leads'}
            </button>
          </form>

          <div className="mt-6 text-sm text-gray-400 space-y-1">
            <p>• Processes 10 phone numbers in parallel</p>
            <p>• Only non-DNC leads are included in the output</p>
            <p>• Original CSV columns are preserved</p>
            <p>• Token automatically refreshes if expired during processing</p>
          </div>
        </div>
      </div>
    </div>
  );
}

