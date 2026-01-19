'use client';

import type { ReactNode } from 'react';
import { Smartphone, Globe } from 'lucide-react';

type MobilePreviewPanelProps = {
  children: ReactNode;
  /** When true (Electron + browser mode): native browser is in the app’s left 25%; show compact message only. */
  compactForElectron?: boolean;
};

/**
 * Left panel (25%): Mobile View — screen share, browser placeholder, or video.
 * When compactForElectron: "Browser (native)" and instructions for the Electron mapper.
 * Theme: bg-black, text-white, border-white/15, font-orbitron for label.
 */
export default function MobilePreviewPanel({ children, compactForElectron }: MobilePreviewPanelProps) {
  return (
    <div
      className="h-full flex flex-col bg-black"
      style={{ color: 'rgba(255,255,255,0.9)' }}
      role="region"
      aria-label={compactForElectron ? 'Browser (native)' : 'Mobile view'}
    >
      <div className="shrink-0 px-3 py-2 border-b border-white/15 flex items-center gap-2">
        {compactForElectron ? (
          <Globe className="w-4 h-4 text-green-400" aria-hidden />
        ) : (
          <Smartphone className="w-4 h-4 text-slate-400" aria-hidden />
        )}
        <span className="text-xs font-medium text-slate-300 font-data">
          {compactForElectron ? 'Browser (native)' : 'Mobile View (25%)'}
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden flex items-center justify-center">
        {compactForElectron ? (
          <div className="terminal-border text-center p-6 max-w-sm mx-4">
            <p className="text-slate-300 text-sm mb-1">Native browser in the left 25%.</p>
            <p className="text-slate-500 text-xs">Hover to highlight, click to capture XPath + CSS and correlate to network events (3s window).</p>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
