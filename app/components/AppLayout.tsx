'use client';

import Sidebar from './Sidebar';
import AsciiNeuronBackground from './AsciiNeuronBackground';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen relative overflow-hidden w-full">
      {/* Low-cost ASCII neural background */}
      <AsciiNeuronBackground />

      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <main className="ml-64 min-h-screen relative z-10">
        {children}
      </main>
    </div>
  );
}
