'use client';

import LinkedInLeadGenerator from './components/LinkedInLeadGenerator';
import AppLayout from './components/AppLayout';

export default function Home() {
  return (
    <AppLayout>
      <div className="w-full px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <LinkedInLeadGenerator />
      </div>
    </AppLayout>
  );
}
