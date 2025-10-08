import React from 'react';
import AppShell from '../../components/AppShell';
import AuthGuard from '../../components/auth/AuthGuard';

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <AppShell>{children}</AppShell>
    </AuthGuard>
  );
}
