"use client";
import { signInWithEmailAndPassword } from 'firebase/auth';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Label } from '../../../components/ui/label';
import { Separator } from '../../../components/ui/separator';
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
      <header className="text-center space-y-3">
        <div className="flex justify-center mb-4">
          <div className="h-14 w-14 rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 flex items-center justify-center shadow-lg">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
            </svg>
          </div>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Welcome Back</h1>
        <p className="text-sm text-gray-600">Sign in to access your clinic dashboard</p>
      </header>

      <Card padding="lg" variant="outline" className="space-y-6 shadow-sm">
        <form onSubmit={handleLogin} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-semibold text-gray-700">
              Email Address
            </Label>
            <Input 
              id="email"
              type="email" 
              value={email} 
              onChange={e=>setEmail(e.target.value)} 
              placeholder="you@clinic.com" 
              required 
              className="h-10"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-semibold text-gray-700">
              Password
            </Label>
            <Input 
              id="password"
              type="password" 
              value={password} 
              onChange={e=>setPassword(e.target.value)} 
              placeholder="••••••••" 
              required 
              minLength={6}
              className="h-10"
            />
          </div>
          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-start gap-2">
              <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{error}</span>
            </div>
          )}
          <Button type="submit" className="w-full h-11" loading={loading}>
            {!loading && (
              <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
              </svg>
            )}
            Sign In
          </Button>
        </form>
        
        <Separator className="my-4" />
        
        <div className="text-center text-sm text-gray-600">
          <span className="mr-1">New to Waitfree?</span>
          <Link href="/auth/signup" className="text-blue-600 hover:text-blue-700 hover:underline font-semibold transition-colors">
            Create your clinic
          </Link>
        </div>
      </Card>
    </div>
  );
}
