'use client';

import Link from 'next/link';
import AppLayout from '@/app/components/AppLayout';
import TokenInput from '@/src/features/dnc/TokenInput';

const isEnabled = process.env.NEXT_PUBLIC_ENABLE_DNC_TOKEN_UI !== 'false';

export default function DncSettingsPage() {
  return (
    <AppLayout>
      <div className="w-full px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-bold text-white">Manual DNC JWT</h1>
            <p className="text-sm text-slate-300">
              Store a personal USHA JWT for DNC scrubbing. Saved locally in your browser only.
            </p>
          </div>
          <Link href="/dnc-scrub" className="text-sm text-rose-300 hover:text-rose-200">
            Go to DNC scrubber
          </Link>
        </div>

        {!isEnabled && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
            This UI is disabled by <code>NEXT_PUBLIC_ENABLE_DNC_TOKEN_UI=false</code>.
          </div>
        )}

        {isEnabled && (
          <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-6">
            <TokenInput />
          </div>
        )}
      </div>
    </AppLayout>
  );
}
