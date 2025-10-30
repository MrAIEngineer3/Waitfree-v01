import React from 'react';
import { ForceTheme } from '@/components/ForceTheme';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <ForceTheme theme="light">
      <div className="min-h-screen flex items-center justify-center px-2 py-4 sm:p-6 bg-gradient-to-br from-background via-muted/30 to-muted/50">
        {children}
      </div>
    </ForceTheme>
  );
}
