"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React from 'react';

interface PatientShellProps { children: React.ReactNode; }

const nav = [
  { label: 'Home', href: '/' },
  { label: 'Join Queue', href: '/join' },
];

export default function PatientShell({ children }: PatientShellProps) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen flex flex-col relative">
      {/* Decorative gradient mesh overlay (already have global but add a subtle layer) */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-32 w-[32rem] h-[32rem] rounded-full bg-gradient-to-br from-blue-500/25 via-cyan-400/20 to-transparent blur-3xl" />
        <div className="absolute top-1/3 -right-32 w-[28rem] h-[28rem] rounded-full bg-gradient-to-tr from-cyan-400/20 via-blue-500/20 to-transparent blur-3xl" />
      </div>
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-white/70 supports-[backdrop-filter]:bg-white/60 border-b border-white/40 shadow-[0_4px_30px_-8px_rgba(30,41,59,0.12)]">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-6">
          <Link href="/" className="group flex items-center gap-2 font-semibold text-gray-900 text-sm tracking-tight">
            <span className="h-4 w-4 rounded-md bg-gradient-to-br from-blue-600 to-cyan-500 shadow-inner shadow-white/30 ring-1 ring-black/5" />
            <span className="group-hover:opacity-90 transition-opacity">Waitfree</span>
          </Link>
          <nav className="flex items-center gap-1.5">
            {nav.map(item => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${active ? 'text-white bg-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/60'} overflow-hidden`}
                >
                  <span className="relative z-10">{item.label}</span>
                  {active && <span className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 opacity-90" />}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-12 relative">
        {children}
      </main>
      <footer className="mt-auto border-t border-white/50 backdrop-blur-xl bg-white/70 supports-[backdrop-filter]:bg-white/60">
        <div className="max-w-3xl mx-auto px-4 py-8 text-[11px] text-gray-600 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="tracking-wide">&copy; {new Date().getFullYear()} Waitfree. All rights reserved.</p>
          <p className="flex items-center gap-2 font-medium"><span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span></span>Realtime</p>
        </div>
      </footer>
    </div>
  );
}
