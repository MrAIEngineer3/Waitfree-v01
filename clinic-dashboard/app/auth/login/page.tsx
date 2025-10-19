"use client";
import { signInWithEmailAndPassword } from 'firebase/auth';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
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
  router.replace('/dashboard');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to sign in';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto py-14 px-4 space-y-8 w-full">
      <header className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Sign In</h1>
        <p className="text-sm text-gray-600">Access your clinic dashboard.</p>
      </header>

      <Card padding="lg" variant="outline" className="space-y-6">
        <form onSubmit={handleLogin} className="space-y-5">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">Email</label>
            <Input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@clinic.com" required />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">Password</label>
            <Input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
          </div>
          {error && <div className="text-sm text-sem-danger bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}
          <Button type="submit" className="w-full" loading={loading}>Sign In</Button>
        </form>
        <div className="text-center text-xs text-gray-600">
          <span className="mr-1">New here?</span>
          <Link href="/auth/signup" className="text-brand-600 hover:underline font-medium">Create your clinic</Link>
        </div>
      </Card>
    </div>
  );
}
