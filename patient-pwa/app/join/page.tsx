import { Suspense } from 'react';
import JoinForm from './JoinForm';

export default function JoinPage() {
  // Server component: render the client JoinForm inside a Suspense boundary.
  // This prevents Next from attempting to prerender client-only hooks like useSearchParams.
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <JoinForm />
    </Suspense>
  );
}
