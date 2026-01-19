'use client';

import Sidebar from './Sidebar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen relative overflow-hidden spherical-interior w-full">
      {/* Spherical Interior Background - Darker */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none spherical-bg z-0" />
      
      {/* Gridlines in Front */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-[1]">
        {/* Curved Grid Pattern - Creates spherical depth */}
        <div className="spherical-grid" />
      </div>
      
      {/* Ambient Light Sources */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-white opacity-5 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '0s' }} />
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-white opacity-4 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 w-[400px] h-[400px] bg-white opacity-3 rounded-full blur-[80px] animate-pulse" style={{ animationDelay: '2s', transform: 'translate(-50%, -50%)' }} />
        <div className="absolute bottom-1/3 left-1/3 w-[450px] h-[450px] bg-white opacity-4 rounded-full blur-[90px] animate-pulse" style={{ animationDelay: '0.5s' }} />
      </div>

      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <main className="ml-64 min-h-screen relative z-10">
        {children}
      </main>
    </div>
  );
}
