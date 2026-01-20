'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Users, Sparkles, ListTodo, Settings, LogOut, FlaskConical, FileText, Activity } from 'lucide-react';
import BackgroundJobs from './BackgroundJobs';
import { useState } from 'react';

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
      router.refresh();
    } catch (error) {
      console.error('Logout error:', error);
      setLoggingOut(false);
    }
  };

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
    {
      href: '/experimental',
      label: 'Experimental',
      icon: FlaskConical,
    },
    {
      href: '/crokdocs',
      label: 'CrokDocs',
      icon: FileText,
    },
    {
      href: '/tools/api-signal-explorer',
      label: 'API Explorer',
      icon: Activity,
    },
  ];

  return (
    <aside className="w-64 h-screen fixed left-0 top-0 z-50 flex flex-col sidebar-panel">
      {/* Logo/Header */}
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center gap-2">
          <img 
            src="/logo.png" 
            alt="BrainScraper Logo" 
            className="w-14 h-14 object-contain"
          />
          <h1 className="text-xl font-bold" style={{ color: '#ff5757' }}>
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
                    ? 'nav-active'
                    : 'nav-inactive text-gray-300 hover:text-white'
                }
              `}
              style={isActive ? { color: '#ff5757' } : {}}
            >
              <Icon className={`w-4 h-4 state-transition ${isActive ? '' : 'text-gray-400'}`} style={isActive ? { color: '#ff5757' } : {}} />
              <span className={`font-medium text-sm ${isActive ? '' : 'text-gray-300'}`} style={isActive ? { color: '#ff5757' } : {}}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Background Jobs Widget */}
      <div className="p-4 border-t border-white/10">
        <BackgroundJobs />
      </div>

      {/* Logout Button */}
      <div className="p-4 border-t border-white/10">
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <LogOut className="w-4 h-4" />
          <span className="font-medium text-sm">
            {loggingOut ? 'Logging out...' : 'Logout'}
          </span>
        </button>
      </div>
    </aside>
  );
}
