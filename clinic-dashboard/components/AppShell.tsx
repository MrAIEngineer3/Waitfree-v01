"use client";
import { Sheet, SheetContent, SheetTrigger } from './ui/sheet';
import { Separator } from './ui/separator';
import { signOut } from 'firebase/auth';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { auth } from '../lib/firebase';
import { useClinicContext } from './ClinicContext';
import ClinicJoinQR from './ClinicJoinQR';
import DoctorPicker from './DoctorPicker';
import DoctorStatusToggle from './DoctorStatusToggle';
import EnvWarningBanner from './EnvWarningBanner';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';

interface NavItem {
  label: string;
  href: string;
  soon?: boolean;
  icon?: React.ReactNode;
  isSubItem?: boolean;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    label: 'MAIN',
    items: [
      { 
        label: 'Queue', 
        href: '/dashboard',
        icon: (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
          </svg>
        )
      },
      { 
        label: 'Analytics', 
        href: '/analytics',
        icon: (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        )
      },
    ]
  },
  {
    label: 'SETTINGS',
    items: [
      { 
        label: 'Profile', 
        href: '/settings/profile',
        icon: (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        ),
        isSubItem: true
      },
      { 
        label: 'Security', 
        href: '/settings/security',
        icon: (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        ),
        isSubItem: true
      },
      { 
        label: 'Doctors', 
        href: '/settings/doctors',
        icon: (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        ),
        isSubItem: true
      },
      { 
        label: 'Workflow', 
        href: '/settings/workflow',
        icon: (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 3H7a2 2 0 01-2-2V7a2 2 0 012-2h3l1-2h2l1 2h3a2 2 0 012 2v10a2 2 0 01-2 2z" />
          </svg>
        ),
        isSubItem: true
      },
      { 
        label: 'Notifications', 
        href: '/settings/notifications',
        icon: (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        ),
        isSubItem: true
      },
      { 
        label: 'Billing', 
        href: '/settings/billing',
        icon: (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </svg>
        ),
        isSubItem: true
      },
      { 
        label: 'Preferences', 
        href: '/settings/preferences',
        icon: (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
        ),
        isSubItem: true
      },
      { 
        label: 'Support', 
        href: '/settings/support',
        icon: (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        ),
        isSubItem: true
      },
      { 
        label: 'Account', 
        href: '/settings/account',
        icon: (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
        isSubItem: true
      },
    ]
  }
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { clinicId, clinicName, doctorId, doctorName, queueStatus } = useClinicContext();
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
      '/settings/profile',
      '/settings/security',
      '/settings/doctors',
  '/settings/workflow',
      '/settings/notifications',
      '/settings/billing',
      '/settings/preferences',
      '/settings/support',
      '/settings/account',
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
        </div>
        <nav className="flex-1 px-3 py-4 overflow-y-auto">
          {navSections.map((section, sectionIdx) => (
            <div key={section.label} className="mb-6">
              <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-2 px-3">
                {section.label}
              </p>
              <div className="space-y-1">
                {section.items.map(item => {
                  const active = pathname === item.href || (pathname?.startsWith(item.href + '/') ?? false);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onMouseEnter={() => {
                        void router.prefetch(item.href);
                      }}
                      className={`group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors border ${
                        active 
                          ? 'bg-gray-900 text-white border-gray-900 shadow-sm' 
                          : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100/60 border-transparent'
                      } ${item.isSubItem ? 'pl-4' : ''}`}
                    >
                      {item.icon && (
                        <span className="flex-shrink-0">
                          {item.icon}
                        </span>
                      )}
                      <span className="flex-1">{item.label}</span>
                      {item.soon && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-700 border border-gray-300">Soon</span>}
                    </Link>
                  );
                })}
              </div>
              {sectionIdx < navSections.length - 1 && (
                <Separator className="mt-6" />
              )}
            </div>
          ))}
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
                      <div className="px-3 pt-3 space-y-3">
                        <DoctorPicker clinicId={clinicId} value={doctorId ?? undefined} />
                        {doctorId && (
                          <DoctorStatusToggle 
                            clinicId={clinicId} 
                            doctorId={doctorId}
                            doctorName={doctorName ?? undefined}
                            showLabel={true}
                          />
                        )}
                      </div>
                    )}
                    <nav className="py-2 max-h-[60vh] overflow-y-auto">
                      {navSections.map((section) => (
                        <div key={section.label} className="mb-4">
                          <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-2 px-3">
                            {section.label}
                          </p>
                          <div className="space-y-0.5">
                            {section.items.map(item => {
                              const active = pathname === item.href || (pathname?.startsWith(item.href + '/') ?? false);
                              return (
                                <Link
                                  key={item.href}
                                  href={item.href}
                                  onMouseEnter={() => {
                                    void router.prefetch(item.href);
                                  }}
                                  className={`flex items-center gap-3 px-3 py-2 text-sm ${
                                    active 
                                      ? 'text-gray-900 font-semibold bg-gray-100' 
                                      : 'text-gray-700 hover:bg-gray-50'
                                  } ${item.isSubItem ? 'pl-6' : ''}`}
                                >
                                  {item.icon && (
                                    <span className="flex-shrink-0">
                                      {item.icon}
                                    </span>
                                  )}
                                  <span className="flex-1">{item.label}</span>
                                  {active && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-900 text-white">Active</span>}
                                </Link>
                              );
                            })}
                          </div>
                        </div>
                      ))}
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
                  <div className="mt-1 flex items-center gap-3 flex-wrap">
                    <DoctorPicker clinicId={clinicId} value={doctorId ?? undefined} />
                    {doctorId && (
                      <DoctorStatusToggle 
                        clinicId={clinicId} 
                        doctorId={doctorId}
                        doctorName={doctorName ?? undefined}
                        showLabel={true}
                      />
                    )}
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
