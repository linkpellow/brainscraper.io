'use client';

import type { ReactNode } from 'react';
import { ScrollText } from 'lucide-react';

type LogsScreenPanelProps = {
  children: ReactNode;
};

/**
 * Right panel (75%): Logs Screen — API table, filters, endpoint list.
 * Theme: bg-slate-900, text-white, border-white/15, font-data for table content.
 */
export default function LogsScreenPanel({ children }: LogsScreenPanelProps) {
  return (
    <div
      className="h-full flex flex-col bg-slate-900"
      style={{ color: 'rgba(255,255,255,0.9)' }}
      role="region"
      aria-label="Logs screen"
    >
      <div className="shrink-0 px-3 py-2 border-b border-white/15 flex items-center gap-2">
        <ScrollText className="w-4 h-4 text-slate-400" aria-hidden />
        <span className="text-xs font-medium text-slate-300 font-data">Logs Screen (75%)</span>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col relative">
        {children}
      </div>
    </div>
  );
}
