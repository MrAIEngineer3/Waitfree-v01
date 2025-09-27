"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import EnvWarningBanner from './EnvWarningBanner';

interface NavItem {
  label: string;
  href: string;
  soon?: boolean;
}

const nav: NavItem[] = [
  { label: 'Queue', href: '/' },
  { label: 'Analytics', href: '/analytics', soon: true },
  { label: 'Settings', href: '/settings', soon: true },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen w-full flex bg-gray-50 text-gray-900">
      {/* Sidebar */}
      <aside className="hidden md:flex md:flex-col w-60 border-r border-gray-200 bg-white/80 backdrop-blur-sm">
        <div className="px-5 py-5 border-b border-gray-200">
          <div className="text-lg font-semibold tracking-tight flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm bg-gradient-to-r from-blue-500 to-cyan-400 inline-block" />
            Waitfree
          </div>
          <p className="text-[11px] uppercase tracking-wide text-gray-500 mt-3">Navigation</p>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {nav.map(item => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors border border-transparent ${active ? 'bg-gray-100 text-gray-900 border-gray-300 shadow-inner' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100/60'}`}
              >
                <span>{item.label}</span>
                {item.soon && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-700 border border-gray-300">Soon</span>}
              </Link>
            );
          })}
        </nav>
        <div className="px-4 py-4 text-[10px] text-gray-500 border-t border-gray-200">
          <p>Build {new Date().getFullYear()}</p>
        </div>
      </aside>
      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 backdrop-blur supports-[backdrop-filter]:bg-white/70 bg-white/90 border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="md:hidden block">
                <div className="h-8 w-8 rounded-md bg-gray-100 flex items-center justify-center text-gray-600 text-xs">WF</div>
              </div>
              <h1 className="text-sm font-medium text-gray-700 tracking-wide">Clinic Dashboard</h1>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" aria-label="Realtime Connected" />
              <span className="text-[11px] text-gray-600">Realtime</span>
            </div>
          </div>
          <div className="max-w-7xl mx-auto px-4 pb-2"><EnvWarningBanner /></div>
        </header>
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
