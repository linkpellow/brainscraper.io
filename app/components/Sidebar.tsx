'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Users, Sparkles, ListTodo } from 'lucide-react';

export default function Sidebar() {
  const pathname = usePathname();

  const navItems = [
    {
      href: '/',
      label: 'Lead Generation',
      icon: Sparkles,
    },
    {
      href: '/enrichment-queue',
      label: 'Enrichment Queue',
      icon: ListTodo,
    },
    {
      href: '/enriched',
      label: 'Enriched Leads',
      icon: Users,
    },
  ];

  return (
    <aside className="w-64 bg-slate-900/80 backdrop-blur-xl border-r border-slate-700/50 h-screen fixed left-0 top-0 z-50 flex flex-col">
      {/* Logo/Header */}
      <div className="p-6 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <img 
            src="/logo.png" 
            alt="BrainScraper Logo" 
            className="w-14 h-14 object-contain"
            style={{
              filter: 'brightness(0) saturate(100%) invert(48%) sepia(100%) saturate(2000%) hue-rotate(195deg) brightness(1.1) contrast(1.1)',
            }}
          />
          <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            BrainScraper
          </h1>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200
                ${
                  isActive
                    ? 'bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-blue-500/50 text-blue-300 shadow-lg shadow-blue-500/10'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                }
              `}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-blue-400' : 'text-slate-500'}`} />
              <span className="font-medium text-sm">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
