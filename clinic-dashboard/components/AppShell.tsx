"use client";
import { Sheet, SheetContent, SheetTrigger } from './ui/sheet';
import { signOut } from 'firebase/auth';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { auth } from '../lib/firebase';
import { useClinicContext } from './ClinicContext';
import ClinicJoinQR from './ClinicJoinQR';
import DoctorPicker from './DoctorPicker';
import EnvWarningBanner from './EnvWarningBanner';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';

interface NavItem {
  label: string;
  href: string;
  soon?: boolean;
}

const nav: NavItem[] = [
  { label: 'Queue', href: '/dashboard' },
  { label: 'Analytics', href: '/analytics' },
  { label: 'Settings', href: '/settings' },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { clinicId, clinicName, doctorId, queueStatus } = useClinicContext();
  const [showJoinQr, setShowJoinQr] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close mobile menu when pathname changes
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!clinicId || typeof window === 'undefined') {
      return;
    }

    const targets = new Set<string>([
      '/dashboard',
      '/analytics',
      '/settings',
      '/settings/notifications',
      '/settings/profile',
      '/settings/preferences',
      '/settings/doctors',
      '/settings/security',
      '/settings/support',
    ]);

    const timeoutId = window.setTimeout(() => {
      targets.forEach((href) => {
        void router.prefetch(href);
      });
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [clinicId, router]);

  const renderQueueStatus = (status: typeof queueStatus) => {
    if (!status) return null;
    const variant = status === 'active' ? 'success' : status === 'paused' ? 'warning' : 'destructive';
    const text = status === 'active' ? 'Active' : status === 'paused' ? 'Paused' : 'Ended';
    return <Badge variant={variant} className="ml-2">{text}</Badge>;
  };
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
            const active = pathname === item.href || (pathname?.startsWith(item.href + '/') ?? false);
            return (
              <Link
                key={item.href}
                href={item.href}
                onMouseEnter={() => {
                  void router.prefetch(item.href);
                }}
                className={`group flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors border ${active ? 'bg-gray-900 text-white border-gray-900 shadow-sm' : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100/60 border-transparent'}`}
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
            <div className="flex items-center gap-4 min-w-0 flex-1">
              <div className="md:hidden block">
                <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                  <SheetTrigger asChild>
                    <button
                      aria-label="Open menu"
                      className="inline-flex items-center justify-center h-9 w-9 rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 active:bg-gray-100 shadow-sm"
                    >
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="3" y1="6" x2="21" y2="6" />
                        <line x1="3" y1="12" x2="21" y2="12" />
                        <line x1="3" y1="18" x2="21" y2="18" />
                      </svg>
                    </button>
                  </SheetTrigger>
                  <SheetContent
                    side="left"
                    title="Menu"
                    description="Main navigation and actions"
                  >
                    <div className="px-5 py-5 border-b border-gray-200">
                      <div className="text-lg font-semibold tracking-tight flex items-center gap-2">
                        <span className="h-3 w-3 rounded-sm bg-gradient-to-r from-blue-500 to-cyan-400 inline-block" />
                        Waitfree
                      </div>
                    </div>
                    {clinicId && (
                      <div className="px-3 pt-3">
                        <DoctorPicker clinicId={clinicId} value={doctorId ?? undefined} />
                      </div>
                    )}
                    <nav className="py-2">
                      {nav.map(item => {
                        const active = pathname === item.href;
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onMouseEnter={() => {
                              void router.prefetch(item.href);
                            }}
                            className={`flex items-center justify-between px-3 py-2 text-sm ${active ? 'text-gray-900 font-semibold' : 'text-gray-700 hover:bg-gray-50'}`}
                          >
                            <span>{item.label}</span>
                            {active && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-900 text-white">Active</span>}
                          </Link>
                        );
                      })}
                    </nav>
                    <div className="border-t border-gray-200" />
                    <div className="p-2 flex flex-col gap-2">
                      {clinicId && (
                        <button
                          onClick={() => { 
                            setShowJoinQr(true);
                            setMobileMenuOpen(false);
                          }}
                          className="h-10 w-full inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 active:bg-gray-100 shadow-sm"
                        >
                          <svg className="w-4 h-4 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM17 17h.01M14 14h7v7h-7z" />
                          </svg>
                          Show QR
                        </button>
                      )}
                      <button
                        onClick={() => { 
                          signOut(auth);
                          setMobileMenuOpen(false);
                        }}
                        className="h-10 w-full inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 active:bg-gray-100 shadow-sm"
                      >
                        Sign out
                      </button>
                    </div>
                  </SheetContent>
                </Sheet>
              </div>

              {/* Header: Clinic title and doctor picker */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h1 className="text-sm sm:text-base font-semibold text-gray-900 tracking-wide truncate">
                    {clinicName || 'Clinic'}
                  </h1>
                  {renderQueueStatus(queueStatus)}
                </div>
                {clinicId && (
                  <div className="mt-1">
                    <DoctorPicker clinicId={clinicId} value={doctorId ?? undefined} />
                  </div>
                )}
              </div>
            </div>
            
            <div className="hidden md:flex items-center gap-4 flex-shrink-0">
              {clinicId && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowJoinQr(true)}
                  className="text-gray-700 border-gray-300 hover:bg-gray-50 h-9 px-3"
                  leftIcon={(
                    <svg className="w-3.5 h-3.5 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM17 17h.01M14 14h7v7h-7z" />
                    </svg>
                  )}
                >
                  Show QR
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => signOut(auth)}
                className="text-gray-700 border-gray-300 hover:bg-gray-50 h-9 px-3"
              >
                Sign out
              </Button>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" aria-label="Realtime Connected" />
                <span className="text-[11px] text-gray-600">Realtime</span>
              </div>
            </div>

            {/* Mobile hamburger (shows menu with actions and nav) */}
            <div className="md:hidden flex items-center gap-2 flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" aria-label="Realtime Connected" />
              </div>
            </div>
          </div>
          <div className="max-w-7xl mx-auto px-4 pb-2"><EnvWarningBanner /></div>
        </header>
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-4">
          {children}
        </main>

        {/* Lightweight Modal for Patient Join QR, hosted at shell to avoid page duplication */}
        {clinicId && showJoinQr && (
          <div className="fixed inset-0 z-50" aria-modal="true" role="dialog">
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowJoinQr(false)} />
            <div className="relative z-10 flex items-center justify-center min-h-full p-4">
              <div className="relative w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
                <button
                  className="absolute -top-2 -right-2 z-20 h-8 w-8 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center text-gray-600 hover:text-gray-800"
                  onClick={() => setShowJoinQr(false)}
                  aria-label="Close"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
                <ClinicJoinQR clinicId={clinicId} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
