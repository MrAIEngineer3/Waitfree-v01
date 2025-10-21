"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLayoutEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

const tabs = [
  { 
    label: 'Profile', 
    href: '/settings/profile',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    )
  },
  { 
    label: 'Security', 
    href: '/settings/security',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    )
  },
  { 
    label: 'Doctors', 
    href: '/settings/doctors',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    )
  },
  { 
    label: 'Workflow', 
    href: '/settings/workflow',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 3H7a2 2 0 01-2-2V7a2 2 0 012-2h3l1-2h2l1 2h3a2 2 0 012 2v10a2 2 0 01-2 2z" />
      </svg>
    )
  },
  { 
    label: 'Notifications', 
    href: '/settings/notifications',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
    )
  },
  { 
    label: 'Billing', 
    href: '/settings/billing',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    )
  },
  { 
    label: 'Preferences', 
    href: '/settings/preferences',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
      </svg>
    )
  },
  { 
    label: 'Support', 
    href: '/settings/support',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    )
  },
  { 
    label: 'Account', 
    href: '/settings/account',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )
  },
];

export default function SettingsTabs() {
  const pathname = usePathname();
  const tabsListRef = useRef<HTMLDivElement>(null);

  const activeValue =
    tabs.find((tab) => pathname.startsWith(tab.href))?.href ?? tabs[0].href;

  // Auto-scroll to active tab when pathname changes
  useLayoutEffect(() => {
    const tabsList = tabsListRef.current;
    if (!tabsList) return;

    const activeIndex = tabs.findIndex((tab) => activeValue === tab.href);
    const safeIndex = activeIndex === -1 ? 0 : activeIndex;
    const activeTab = tabsList.children[safeIndex] as HTMLElement | undefined;

    if (!activeTab) return;

    const left = safeIndex === 0
      ? 0
      : Math.max(0, activeTab.offsetLeft - 16);
    const clampedLeft = Math.max(
      0,
      Math.min(left, tabsList.scrollWidth - tabsList.clientWidth)
    );

    tabsList.scrollTo({ left: clampedLeft, behavior: 'auto' });
  }, [activeValue, pathname]);

  return (
    <nav aria-label="Settings sections" className="w-full">
      <div
        ref={tabsListRef}
        className="flex h-auto w-full flex-nowrap gap-2 overflow-x-auto rounded-lg bg-muted/70 p-1 text-muted-foreground sm:grid sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 sm:overflow-visible scrollbar-hide"
        role="tablist"
      >
        {tabs.map((t) => {
          const isActive = activeValue === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex min-w-[10rem] shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-4 py-2.5 text-xs font-medium transition-colors duration-200 sm:min-w-0 sm:px-2 sm:py-3 sm:text-sm sm:justify-center',
                isActive
                  ? 'bg-background text-foreground shadow'
                  : 'bg-transparent text-muted-foreground hover:bg-background/60'
              )}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-background/60 text-current sm:h-7 sm:w-7">
                {t.icon}
              </span>
              <span className="truncate">{t.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
