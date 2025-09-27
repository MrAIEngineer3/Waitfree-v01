"use client";
import { signInWithEmailAndPassword } from 'firebase/auth';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { auth } from '../../../lib/firebase';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      router.push('/');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to sign in';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto py-14 px-4 space-y-10">
      <header className="text-center space-y-3">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Sign In</h1>
        <p className="text-sm text-gray-600">Access your clinic dashboard.</p>
      </header>

      <form onSubmit={handleLogin} className="space-y-6 bg-white/70 backdrop-blur border border-gray-200 rounded-xl p-6 shadow-sm">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Email</label>
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="you@clinic.com" required />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Password</label>
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="••••••••" required minLength={6} />
        </div>
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}
        <button disabled={loading} className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold tracking-wide disabled:opacity-40">{loading ? 'Signing In...' : 'Sign In'}</button>
        <div className="text-center text-xs text-gray-600">
          <span className="mr-1">New here?</span>
          <Link href="/auth/signup" className="text-blue-600 underline">Create your clinic</Link>
        </div>
      </form>
    </div>
  );
}
