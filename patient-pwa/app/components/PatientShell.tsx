"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React from 'react';
import SiteFooter from './SiteFooter';
import Logo from '../../components/Logo';

interface PatientShellProps { children: React.ReactNode; }

const nav = [
  { label: 'Home', href: '/' },
  { label: 'Join Queue', href: '/join' },
];

export default function PatientShell({ children }: PatientShellProps) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen flex flex-col relative overflow-x-hidden">
      {/* Decorative gradient mesh overlay with reduced spread to avoid horizontal scroll */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-20 w-[28rem] h-[28rem] rounded-full bg-gradient-to-br from-blue-500/25 via-cyan-400/20 to-transparent blur-3xl" />
        <div className="absolute top-1/3 -right-20 w-[24rem] h-[24rem] rounded-full bg-gradient-to-tr from-cyan-400/20 via-blue-500/20 to-transparent blur-3xl" />
      </div>

      {/* Header: New glass card design */}
      <header className="sticky top-0 z-50 w-full">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="my-4 glass-card rounded-full flex items-center justify-between p-2 shadow-sm">
            <Link href="/" className="flex items-center gap-2 pl-4">
              <Logo className="text-gray-900" />
            </Link>
            <nav className="flex items-center gap-1.5">
              {nav.map(item => {
                const active = pathname === item.href;
                
                // Special handling for "Join Queue" when on home page
                if (item.label === 'Join Queue' && pathname === '/') {
                  return (
                    <button
                      key={item.href}
                      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                      className={`px-4 py-2 text-sm font-medium rounded-full transition-colors ${active ? 'text-white bg-gray-900' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/50'}`}
                    >
                      {item.label}
                    </button>
                  );
                }
                
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={false}
                    className={`px-4 py-2 text-sm font-medium rounded-full transition-colors ${active ? 'text-white bg-gray-900' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/50'}`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      </header>

      {/* Main content - no background to let gradient show through */}
      <main className="relative flex-1 w-full">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
