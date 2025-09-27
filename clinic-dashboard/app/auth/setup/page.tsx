"use client";

import { httpsCallable } from 'firebase/functions';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { auth, functions } from '../../../lib/firebase';

interface BootstrapResult { success: boolean; clinicId: string; doctorId: string; queueId: string; }

export default function SetupPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const bootstrapFn = httpsCallable(functions, 'bootstrapClinicAccount');

  useEffect(() => {
    const setupClinic = async () => {
      try {
        // Check if user is authenticated
        if (!auth.currentUser) {
          console.log('No current user, redirecting to login');
          router.push('/auth/login');
          return;
        }

        // Get signup data from sessionStorage
        const signupDataStr = sessionStorage.getItem('clinicSignupData');
        if (!signupDataStr) {
          console.log('No signup data found, redirecting to signup');
          router.push('/auth/signup');
          return;
        }

        const signupData = JSON.parse(signupDataStr);
        console.log('Setting up clinic for user:', auth.currentUser.uid, 'with data:', signupData);

        // Call bootstrap function
        const res = await bootstrapFn(signupData);
        const data = res.data as BootstrapResult;
        console.log('Bootstrap result:', data);

        if (!data?.success) {
          throw new Error('Bootstrap failed: ' + JSON.stringify(data));
        }

        // Clear the signup data
        sessionStorage.removeItem('clinicSignupData');

        // Redirect to dashboard
        router.push('/');
      } catch (err: unknown) {
        console.error('Setup error:', err);
        const message = err instanceof Error ? err.message : 'Failed to set up clinic';
        setError(message);
        setLoading(false);
      }
    };

    setupClinic();
  }, [router, retryCount, bootstrapFn]);

  const handleRetry = () => {
    setError(null);
    setLoading(true);
    setRetryCount(prev => prev + 1);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-cyan-50">
        <div className="text-center space-y-4">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-gray-600">Setting up your clinic...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-50 px-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center space-y-6">
        <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto">
          <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>

        <div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Setup Failed</h1>
          <p className="text-gray-600 text-sm mb-4">
            Your account was created but we couldn&apos;t set up your clinic. This might be a temporary issue.
          </p>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
              <p className="text-red-800 text-xs font-mono">{error}</p>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <button
            onClick={handleRetry}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            Try Again
          </button>

          <button
            onClick={() => router.push('/')}
            className="w-full px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition-colors"
          >
            Continue to Dashboard
          </button>
        </div>

        <p className="text-xs text-gray-500">
          If this problem persists, please contact support with the error details above.
        </p>
      </div>
    </div>
  );
}