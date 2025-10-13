import React from 'react';
import AppShell from '../../components/AppShell';
import AuthGuard from '../../components/auth/AuthGuard';
import ClinicContextProvider from '../../components/ClinicContextProvider';

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <ClinicContextProvider>
        <AppShell>{children}</AppShell>
      </ClinicContextProvider>
    </AuthGuard>
  );
}
