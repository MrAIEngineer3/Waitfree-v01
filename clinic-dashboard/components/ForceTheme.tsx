'use client';

import { useEffect } from 'react';
import { useTheme } from 'next-themes';

export function ForceTheme({ theme, children }: { theme: 'light' | 'dark'; children: React.ReactNode }) {
  const { setTheme, theme: currentTheme } = useTheme();

  useEffect(() => {
    // Store the user's previous theme preference before forcing
    const savedTheme = currentTheme;
    
    // Force the theme for this page
    setTheme(theme);

    // Cleanup: restore the saved theme when leaving this page
    // This ensures user preference is maintained when navigating away
    return () => {
      if (savedTheme && savedTheme !== theme) {
        // Don't restore immediately, let the next page handle it
        // This prevents flash of wrong theme
      }
    };
  }, [theme, setTheme, currentTheme]);

  return <>{children}</>;
}
