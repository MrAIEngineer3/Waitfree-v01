import React from 'react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-white via-gray-50 to-gray-100">
      {children}
    </div>
  );
}
