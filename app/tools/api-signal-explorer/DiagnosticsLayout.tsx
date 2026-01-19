'use client';

import type { ReactNode } from 'react';

type DiagnosticsLayoutProps = {
  left: ReactNode;
  right: ReactNode;
  /** When true (e.g. Electron + browser mode), hide the Video Stream placeholder so the native WebContentsView occupies that real estate; logs take full width. */
  hideLeft?: boolean;
};

/**
 * Chromium-style two-panel diagnostics layout: Mobile View (25%) | Logs Screen (75%).
 * When hideLeft, the left is not rendered and the right (logs) takes full width.
 */
export default function DiagnosticsLayout({ left, right, hideLeft }: DiagnosticsLayoutProps) {
  return (
    <div
      className="flex-1 flex overflow-hidden min-h-0 border border-white/15"
      style={{ backgroundColor: '#0a0a0a' }}
      role="region"
      aria-label="Diagnostics split view"
    >
      {!hideLeft && (
        <div className="w-[25%] min-w-0 shrink-0 flex overflow-hidden">
          {left}
        </div>
      )}
      <div className={`flex-1 min-w-0 flex overflow-hidden ${hideLeft ? '' : 'border-l border-dashed border-white/20'}`}>
        {right}
      </div>
    </div>
  );
}
