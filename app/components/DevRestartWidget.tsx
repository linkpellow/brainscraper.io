'use client';

import { useState, useEffect } from 'react';
import { RotateCw, Zap, AlertCircle, CheckCircle } from 'lucide-react';

export default function DevRestartWidget() {
  const [isRestarting, setIsRestarting] = useState(false);
  const [status, setStatus] = useState<'idle' | 'restarting' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [isDev, setIsDev] = useState(false);

  useEffect(() => {
    // Check if we're in development mode
    setIsDev(window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  }, []);

  if (!isDev) return null;

  const handleRestart = async () => {
    setIsRestarting(true);
    setStatus('restarting');
    setMessage('Restarting servers...');

    try {
      const response = await fetch('/api/dev/restart-servers', {
        method: 'POST',
      });

      const data = await response.json();

      if (data.ok) {
        setStatus('success');
        setMessage('Servers restarted! Refreshing in 3s...');
        
        // Wait for servers to fully restart, then reload
        setTimeout(() => {
          window.location.reload();
        }, 3000);
      } else {
        setStatus('error');
        setMessage(data.error || 'Restart failed');
        setTimeout(() => {
          setStatus('idle');
          setIsRestarting(false);
        }, 3000);
      }
    } catch (error) {
      setStatus('error');
      setMessage('Failed to restart servers');
      setTimeout(() => {
        setStatus('idle');
        setIsRestarting(false);
      }, 3000);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end gap-2">
      {/* Status message */}
      {status !== 'idle' && (
        <div className={`px-4 py-2 rounded-lg shadow-xl backdrop-blur-sm border animate-in slide-in-from-bottom-2 ${
          status === 'restarting' ? 'bg-blue-900/90 border-blue-500/50 text-blue-200' :
          status === 'success' ? 'bg-green-900/90 border-green-500/50 text-green-200' :
          'bg-red-900/90 border-red-500/50 text-red-200'
        }`}>
          <div className="flex items-center gap-2 text-sm font-medium">
            {status === 'restarting' && <RotateCw className="w-4 h-4 animate-spin" />}
            {status === 'success' && <CheckCircle className="w-4 h-4" />}
            {status === 'error' && <AlertCircle className="w-4 h-4" />}
            <span>{message}</span>
          </div>
        </div>
      )}

      {/* Restart button */}
      <button
        onClick={handleRestart}
        disabled={isRestarting}
        className="group relative flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 disabled:from-gray-700 disabled:to-gray-600 rounded-full shadow-2xl shadow-orange-500/50 text-white font-bold transition-all duration-300 hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        title="Restart dev server (Next.js)"
      >
        <Zap className={`w-5 h-5 ${isRestarting ? 'animate-pulse' : 'group-hover:rotate-12 transition-transform'}`} />
        <span className="text-sm">
          {isRestarting ? 'Restarting...' : 'Restart'}
        </span>
        {!isRestarting && (
          <div className="absolute inset-0 rounded-full bg-orange-400 animate-ping opacity-20" />
        )}
      </button>

      {/* Dev mode indicator */}
      <div className="text-[10px] text-slate-500 font-mono bg-slate-900/80 px-2 py-1 rounded-full border border-slate-700">
        DEV MODE
      </div>
    </div>
  );
}
