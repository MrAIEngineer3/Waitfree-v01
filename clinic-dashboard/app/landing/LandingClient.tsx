"use client";
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import { auth, db } from '../../lib/firebase';

export default function LandingClient() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [mapping, setMapping] = useState<{ clinicId?: string; doctorId?: string } | null>(null);
  const isMapped = !!(mapping?.clinicId && mapping?.doctorId);

  useEffect(() => {
    let unsubMap: (() => void) | null = null;
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      // Always clean up any previous user doc listener when auth state changes
      if (unsubMap) { try { unsubMap(); } catch {} finally { unsubMap = null; } }
      setUser(u);
      if (!u) { setMapping(null); return; }
      const userRef = doc(db, 'users', u.uid);
      unsubMap = onSnapshot(
        userRef,
        (snap) => {
          if (snap.exists()) {
            const data = snap.data() as any;
            setMapping({ clinicId: data.clinicId, doctorId: data.doctorId });
          } else {
            setMapping(null);
          }
        },
        (error) => {
          // When signing out, this listener may briefly error with permission-denied.
          // Swallow it and reset mapping to avoid noisy console errors.
          if ((error as any)?.code === 'permission-denied') {
            setMapping(null);
          } else {
            console.warn('[Landing] user mapping listener error', error);
          }
        }
      );
    });
    return () => {
      try { unsubAuth(); } catch {}
      if (unsubMap) { try { unsubMap(); } catch {} }
    };
  }, []);

  return (
    <div className="relative min-h-screen flex flex-col">
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="pointer-events-none select-none opacity-[0.18] absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,#60a5fa,transparent_60%)]" />
        <div className="pointer-events-none select-none opacity-[0.12] absolute inset-0 bg-[radial-gradient(circle_at_80%_70%,#38bdf8,transparent_60%)]" />
      </div>
      <header className="w-full max-w-7xl mx-auto px-5 pt-6 flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold text-gray-800 tracking-tight">
          <span className="h-3 w-3 rounded-sm bg-gradient-to-r from-brand-500 to-cyan-400" />
          Waitfree
        </div>
        <nav className="hidden md:flex items-center gap-8 text-sm text-gray-600">
          <a href="#features" className="hover:text-gray-900 transition-colors">Features</a>
          <a href="#how" className="hover:text-gray-900 transition-colors">How it works</a>
          <a href="#pricing" className="hover:text-gray-900 transition-colors">Pricing</a>
          <a href="#contact" className="hover:text-gray-900 transition-colors">Contact</a>
        </nav>
        <div className="flex items-center gap-3">
          {!user && (
            <>
              <Button variant="ghost" size="sm" onClick={() => router.push('/auth/login')}>Sign in</Button>
              <Button size="sm" onClick={() => router.push('/auth/signup')}>Get Started</Button>
            </>
          )}
          {user && !isMapped && (
            <Button size="sm" variant="accent" onClick={() => router.push('/dashboard')}>Continue Setup</Button>
          )}
          {user && isMapped && (
            <Button size="sm" variant="secondary" onClick={() => router.push('/dashboard')}>Go to Dashboard</Button>
          )}
        </div>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto px-5 pb-32">
        <section className="pt-24 md:pt-32 flex flex-col items-center text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-white/70 backdrop-blur px-4 py-1 shadow-subtle border border-sem-border">
            <Badge tone="accent" size="sm">New</Badge>
            <span className="text-[11px] font-medium tracking-wide text-gray-600">Realtime queue intelligence for clinics</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight max-w-3xl text-gray-900 leading-tight">Transform patient flow with a realtime, insight-driven clinic operations platform.</h1>
          <p className="mt-6 text-lg md:text-xl text-gray-600 max-w-2xl leading-relaxed">Cut perceived wait times, keep providers in sync, and surface actionable throughput metrics—without bloated legacy systems or rigid kiosk hardware.</p>
          <div className="mt-8 flex flex-col sm:flex-row gap-4">
            {!user && <Button size="lg" onClick={() => router.push('/auth/signup')}>Start Free Trial</Button>}
            {user && !isMapped && <Button size="lg" variant="accent" onClick={() => router.push('/dashboard')}>Finish Setup</Button>}
            {user && isMapped && <Button size="lg" variant="secondary" onClick={() => router.push('/dashboard')}>Open Dashboard</Button>}
            <Button variant="outline" size="lg">Book a Demo</Button>
          </div>
          <p className="mt-4 text-xs text-gray-500">No credit card required • Quick setup • Emulators friendly</p>
        </section>

        <section id="features" className="mt-32 grid md:grid-cols-3 gap-8">
          {[
            { title: 'Realtime Queue Orchestration', body: 'Lightning-fast state updates keep providers and staff aligned without manual refresh.' },
            { title: 'Operational Metrics', body: 'Track throughput, average wait, completion velocity, and drop-off patterns.' },
            { title: 'Patient Experience', body: 'Transparent position & smart messaging reduce anxiety and no-shows.' },
            { title: 'Scalable Structure', body: 'Multi-clinic, multi-provider hierarchy ready for growth.' },
            { title: 'Flexible API', body: 'Extensible event layer for custom automations & integrations.' },
            { title: 'Privacy Forward', body: 'Minimal PHI exposure surfaces; audit-ready architecture.' }
          ].map(card => (
            <Card key={card.title} variant="soft" padding="md" className="h-full flex flex-col">
              <h3 className="text-base font-semibold text-gray-800 mb-2">{card.title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed flex-1">{card.body}</p>
            </Card>
          ))}
        </section>

        <section id="cta" className="mt-40 flex flex-col items-center text-center">
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-gray-900">Ready to reduce waiting friction?</h2>
          <p className="mt-4 text-base text-gray-600 max-w-xl leading-relaxed">Deploy Waitfree and start measuring real improvements in patient flow within a single session.</p>
          <div className="mt-6 flex flex-col sm:flex-row gap-4">
            {!user && <Button size="md" onClick={() => router.push('/auth/signup')}>Create Account</Button>}
            {user && !isMapped && <Button size="md" variant="accent" onClick={() => router.push('/dashboard')}>Complete Setup</Button>}
            {user && isMapped && <Button size="md" variant="secondary" onClick={() => router.push('/dashboard')}>Dashboard</Button>}
            <Button variant="ghost" size="md">View Docs</Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-sem-border bg-white/70 backdrop-blur py-10 mt-auto">
        <div className="max-w-7xl mx-auto px-5 text-xs text-gray-500 flex flex-col md:flex-row gap-4 md:items-center md:justify-between">
          <div>&copy; {new Date().getFullYear()} Waitfree. All rights reserved.</div>
          <div className="flex gap-6">
            <a href="#privacy" className="hover:text-gray-700">Privacy</a>
            <a href="#terms" className="hover:text-gray-700">Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
