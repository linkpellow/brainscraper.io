'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Users, Sparkles, ListTodo, Settings } from 'lucide-react';
import BackgroundJobs from './BackgroundJobs';

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
      label: 'Scrape History',
      icon: ListTodo,
    },
    {
      href: '/enriched',
      label: 'Enriched Leads',
      icon: Users,
    },
    {
      href: '/settings',
      label: 'Settings',
      icon: Settings,
    },
  ];

  return (
    <aside className="w-64 h-screen fixed left-0 top-0 z-50 flex flex-col sidebar-panel">
      {/* Logo/Header */}
      <div className="p-6 border-b border-[#8055a6]/30">
        <div className="flex items-center gap-2">
          <img 
            src="/logo.png" 
            alt="BrainScraper Logo" 
            className="w-14 h-14 object-contain"
          />
          <h1 className="text-xl font-bold bg-gradient-to-r from-[#e272db] via-[#8055a6] to-[#54317d] bg-clip-text text-transparent">
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
                flex items-center gap-3 px-4 py-3 rounded-lg state-transition
                ${
                  isActive
                    ? 'nav-active text-[#e272db]'
                    : 'nav-inactive text-slate-300 hover:text-[#e272db]'
                }
              `}
            >
              <Icon className={`w-4 h-4 state-transition ${isActive ? 'text-[#e272db]' : 'text-slate-400'}`} />
              <span className={`font-medium text-sm ${isActive ? 'bg-gradient-to-r from-[#e272db] via-[#8055a6] to-[#54317d] bg-clip-text text-transparent' : ''}`}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Background Jobs Widget */}
      <div className="p-4 border-t border-[#8055a6]/30">
        <BackgroundJobs />
      </div>
    </aside>
  );
}
