"use client";
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import Logo from '../../components/Logo';
import { Badge } from '../../components/ui/Badge';
import { BentoCard, BentoGrid } from '../../components/ui/bento-grid';
import { Button } from '../../components/ui/Button';
import { Card, CardContent } from '../../components/ui/Card';
import { auth, db } from '../../lib/firebase';

export default function LandingClient() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [mapping, setMapping] = useState<{ clinicId?: string; doctorId?: string } | null>(null);
  const [mounted, setMounted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isScrolled, setIsScrolled] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const [visibleSections, setVisibleSections] = useState<Set<string>>(new Set());
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const heroRef = useRef<HTMLElement>(null);
  const isMapped = !!(mapping?.clinicId && mapping?.doctorId);

  // Smooth scroll handler
  const handleSmoothScroll = useCallback((e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    e.preventDefault();
    const target = document.querySelector(targetId);
    if (target) {
      const headerOffset = 80;
      const elementPosition = target.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
      window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
      setMobileMenuOpen(false);
    }
  }, []);

  // Track scroll position for header
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
      setScrollY(window.scrollY);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Intersection observer for scroll-triggered animations
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisibleSections((prev) => new Set(prev).add(entry.target.id));
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -100px 0px' }
    );

    const sections = document.querySelectorAll('[data-animate-section]');
    sections.forEach((section) => observer.observe(section));

    return () => observer.disconnect();
  }, [mounted]);

  // Prevent scroll when mobile menu is open
  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileMenuOpen]);

  // Prevent scroll when mobile menu is open
  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileMenuOpen]);

  // Mouse tracking for spotlight effect
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  useEffect(() => {
    setMounted(true);
    setIsLoading(true);
    let unsubMap: (() => void) | null = null;
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      // Always clean up any previous user doc listener when auth state changes
      if (unsubMap) { try { unsubMap(); } catch {} finally { unsubMap = null; } }
      setUser(u);
      setIsLoading(false);
      if (!u) { setMapping(null); return; }
      const userRef = doc(db, 'users', u.uid);
      unsubMap = onSnapshot(
        userRef,
        (snap) => {
          if (snap.exists()) {
            const data = snap.data() as { clinicId?: string; doctorId?: string };
            setMapping({ clinicId: data.clinicId, doctorId: data.doctorId });
          } else {
            setMapping(null);
          }
        },
        (error) => {
          // When signing out, this listener may briefly error with permission-denied.
          // Swallow it and reset mapping to avoid noisy console errors.
          if ((error as { code?: string })?.code === 'permission-denied') {
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
      {/* Skip to main content */}
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-brand-600 focus:text-white focus:rounded-md">
        Skip to main content
      </a>

      {/* Animated background with parallax and gradient mesh */}
      <div className="absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
        {/* Base gradient orbs with parallax */}
        <div 
          className="pointer-events-none select-none opacity-[0.18] absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,#60a5fa,transparent_60%)] animate-[pulse_8s_ease-in-out_infinite]"
          style={{ transform: `translateY(${scrollY * 0.1}px)` }}
        />
        <div 
          className="pointer-events-none select-none opacity-[0.12] absolute inset-0 bg-[radial-gradient(circle_at_80%_70%,#38bdf8,transparent_60%)] animate-[pulse_12s_ease-in-out_infinite]"
          style={{ transform: `translateY(${scrollY * 0.15}px)` }}
        />
        
        {/* Enhanced gradient mesh - morphing blobs */}
        <div 
          className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-to-b from-brand-100/40 to-transparent blur-3xl animate-[float_6s_ease-in-out_infinite]"
          style={{ transform: `translate(-50%, ${scrollY * 0.2}px)` }}
        />
        <div 
          className="pointer-events-none absolute top-1/4 right-10 w-64 h-64 bg-gradient-to-br from-cyan-400/10 to-blue-500/10 rounded-full blur-3xl animate-[float_8s_ease-in-out_infinite]"
          style={{ transform: `translateY(${scrollY * 0.25}px)` }}
        />
        <div 
          className="pointer-events-none absolute bottom-1/4 left-10 w-96 h-96 bg-gradient-to-tr from-brand-400/10 to-purple-500/10 rounded-full blur-3xl animate-[float_10s_ease-in-out_infinite]" 
          style={{ animationDelay: '-2s', transform: `translateY(${scrollY * 0.3}px)` }} 
        />
        
        {/* Additional morphing mesh blobs */}
        <div 
          className="pointer-events-none absolute top-1/3 left-1/4 w-96 h-96 bg-gradient-to-br from-violet-400/8 to-pink-400/8 rounded-full blur-3xl animate-[float_15s_ease-in-out_infinite]"
          style={{ animationDelay: '-5s', transform: `translateY(${scrollY * 0.12}px)` }}
        />
        <div 
          className="pointer-events-none absolute bottom-1/3 right-1/4 w-80 h-80 bg-gradient-to-tl from-emerald-400/8 to-teal-400/8 rounded-full blur-3xl animate-[float_12s_ease-in-out_infinite]"
          style={{ animationDelay: '-3s', transform: `translateY(${scrollY * 0.18}px)` }}
        />
        
        {/* Spotlight cursor effect - follows mouse */}
        <div 
          className="pointer-events-none absolute w-[600px] h-[600px] opacity-0 hover:opacity-100 transition-opacity duration-1000"
          style={{
            background: 'radial-gradient(circle, rgba(96, 165, 250, 0.15) 0%, transparent 70%)',
            left: mousePosition.x - 300,
            top: mousePosition.y - 300,
            filter: 'blur(40px)',
          }}
        />
      </div>

      {/* Header */}
      <header className={`sticky top-0 z-50 w-full backdrop-blur-xl transition-all duration-500 ${isScrolled ? 'bg-white/30 border-b border-white/20 shadow-sm' : 'bg-transparent border-b border-transparent'} ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-5 h-16 sm:h-20 flex items-center justify-between">
          <Logo className="text-gray-800 tracking-tight group cursor-pointer" iconClassName="group-hover:rotate-180 transition-transform duration-300" />
          
          <nav className="hidden md:flex items-center gap-8 text-sm text-gray-600">
            <a href="#features" onClick={(e) => handleSmoothScroll(e, '#features')} className="hover:text-gray-900 transition-all duration-200 hover:scale-105">Features</a>
            <a href="#how" onClick={(e) => handleSmoothScroll(e, '#how')} className="hover:text-gray-900 transition-all duration-200 hover:scale-105">How it works</a>
            <a href="#problems" onClick={(e) => handleSmoothScroll(e, '#problems')} className="hover:text-gray-900 transition-all duration-200 hover:scale-105">Solutions</a>
            <a href="#contact" onClick={(e) => handleSmoothScroll(e, '#contact')} className="hover:text-gray-900 transition-all duration-200 hover:scale-105">Contact</a>
          </nav>
          
          <div className="hidden md:flex items-center gap-3">
            {isLoading ? (
              <div className="flex gap-3">
                <div className="w-20 h-9 bg-gray-200 rounded-md animate-pulse" />
                <div className="w-24 h-9 bg-gray-200 rounded-md animate-pulse" />
              </div>
            ) : (
              <>
                {!user && (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => router.push('/auth/login')}>Sign in</Button>
                    <Button size="sm" onClick={() => router.push('/auth/signup')}>Sign up</Button>
                  </>
                )}
                {user && !isMapped && <Button size="sm" variant="accent" onClick={() => router.push('/dashboard')}>Continue Setup</Button>}
                {user && isMapped && <Button size="sm" variant="secondary" onClick={() => router.push('/dashboard')}>Dashboard</Button>}
              </>
            )}
          </div>

          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden p-2 text-gray-600 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500 rounded-md cursor-pointer" aria-expanded={mobileMenuOpen} aria-label="Toggle menu">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              {mobileMenuOpen ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /> : <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />}
            </svg>
          </button>
        </div>
      </header>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <>
          <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 md:hidden animate-[fadeIn_200ms_ease-out]" onClick={() => setMobileMenuOpen(false)} />
          <nav className="fixed top-16 sm:top-20 right-0 bottom-0 w-full max-w-sm bg-white shadow-2xl z-40 md:hidden animate-[slideInRight_300ms_ease-out] overflow-y-auto">
            <div className="p-6 space-y-6">
              <div className="space-y-4">
                <a href="#features" onClick={(e) => handleSmoothScroll(e, '#features')} className="block text-lg font-medium text-gray-900 hover:text-brand-600 transition-colors py-2">Features</a>
                <a href="#how" onClick={(e) => handleSmoothScroll(e, '#how')} className="block text-lg font-medium text-gray-900 hover:text-brand-600 transition-colors py-2">How it works</a>
                <a href="#problems" onClick={(e) => handleSmoothScroll(e, '#problems')} className="block text-lg font-medium text-gray-900 hover:text-brand-600 transition-colors py-2">Solutions</a>
                <a href="#contact" onClick={(e) => handleSmoothScroll(e, '#contact')} className="block text-lg font-medium text-gray-900 hover:text-brand-600 transition-colors py-2">Contact</a>
              </div>
              <div className="pt-6 border-t border-gray-200 space-y-3">
                {isLoading ? (
                  <>
                    <div className="w-full h-12 bg-gray-200 rounded-md animate-pulse" />
                    <div className="w-full h-12 bg-gray-200 rounded-md animate-pulse" />
                  </>
                ) : (
                  <>
                    {!user && (
                      <>
                        <Button variant="outline" size="lg" className="w-full justify-center" onClick={() => { setMobileMenuOpen(false); router.push('/auth/login'); }}>Sign in</Button>
                        <Button size="lg" className="w-full justify-center" onClick={() => { setMobileMenuOpen(false); router.push('/auth/signup'); }}>Sign up free</Button>
                      </>
                    )}
                    {user && !isMapped && <Button size="lg" variant="accent" className="w-full justify-center" onClick={() => { setMobileMenuOpen(false); router.push('/dashboard'); }}>Continue Setup</Button>}
                    {user && isMapped && <Button size="lg" variant="secondary" className="w-full justify-center" onClick={() => { setMobileMenuOpen(false); router.push('/dashboard'); }}>Dashboard</Button>}
                  </>
                )}
              </div>
            </div>
          </nav>
        </>
      )}

      <main id="main" className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-5 pb-32">
        {/* Hero */}
        <section ref={heroRef} className="pt-16 sm:pt-24 md:pt-32 flex flex-col items-center text-center">
          <div className={`mb-6 inline-flex items-center gap-2 rounded-full bg-white/70 backdrop-blur px-4 py-1.5 shadow-sm border border-sem-border hover:shadow-md hover:scale-105 transition-all duration-300 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`} style={{ transitionDelay: '100ms' }}>
            <Badge variant="accent">New</Badge>
            <span className="text-[11px] sm:text-xs font-medium tracking-wide text-gray-600">Modern queue management for healthcare</span>
          </div>
          
          <h1 className={`text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight max-w-4xl text-gray-900 leading-[1.1] transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`} style={{ transitionDelay: '200ms' }}>
            Elevate patient care with{' '}
            <span className="relative inline-block">
              <span className="absolute inset-0 bg-gradient-to-r from-blue-600 via-purple-600 via-cyan-500 to-teal-500 bg-clip-text text-transparent animate-[gradient_8s_ease_infinite] bg-[length:300%_auto] blur-[2px] opacity-70"></span>
              <span className="relative bg-gradient-to-r from-blue-600 via-purple-600 via-cyan-500 to-teal-500 bg-clip-text text-transparent animate-[gradient_8s_ease_infinite] bg-[length:300%_auto]">intelligent flow</span>
            </span>
          </h1>
          
          <p className={`mt-6 text-base sm:text-lg md:text-xl text-gray-600 max-w-2xl leading-relaxed px-4 mx-auto transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`} style={{ transitionDelay: '300ms' }}>
            Reduce wait times, improve patient satisfaction, and streamline clinic operations with real-time insights—all in one elegant platform.
          </p>
          
          <div className={`mt-8 sm:mt-10 flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-center w-full sm:w-auto px-4 sm:px-0 transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`} style={{ transitionDelay: '400ms' }}>
            {!user && (
              <>
                <Button size="lg" onClick={() => router.push('/auth/signup')} className="group relative overflow-hidden w-full sm:w-auto justify-center">
                  <span className="relative z-10">Get started free</span>
                  <div className="absolute inset-0 -z-0 bg-gradient-to-r from-brand-600 via-brand-500 to-brand-600 bg-[length:200%_100%] animate-[shimmer_3s_linear_infinite]" />
                </Button>
                <Button variant="outline" size="lg" onClick={() => router.push('/auth/login')} className="hover:border-brand-400 hover:bg-brand-50/50 w-full sm:w-auto justify-center">Sign in</Button>
              </>
            )}
            {user && !isMapped && <Button size="lg" variant="accent" onClick={() => router.push('/dashboard')} className="w-full sm:w-auto justify-center">Finish Setup</Button>}
            {user && isMapped && <Button size="lg" variant="secondary" onClick={() => router.push('/dashboard')} className="w-full sm:w-auto justify-center">Open Dashboard</Button>}
          </div>
          
          <p className={`mt-6 text-xs sm:text-sm text-gray-500 flex flex-wrap items-center justify-center gap-2 transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`} style={{ transitionDelay: '500ms' }}>
            <svg className="w-3.5 h-3.5 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
            <span>No credit card required • Setup in minutes</span>
          </p>

          <div className={`mt-12 sm:mt-16 flex flex-wrap items-center justify-center gap-6 sm:gap-8 text-xs text-gray-400 transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`} style={{ transitionDelay: '600ms' }}>
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M10 2a5 5 0 00-5 5v2a2 2 0 00-2 2v5a2 2 0 002 2h10a2 2 0 002-2v-5a2 2 0 00-2-2H7V7a3 3 0 015.905-.75 1 1 0 001.937-.5A5.002 5.002 0 0010 2z" /></svg>
              <span>HIPAA Compliant</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
              <span>99.9% Uptime</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" /></svg>
              <span>Real-time Updates</span>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section 
          id="stats-section"
          data-animate-section
          className={`mt-16 sm:mt-24 grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8 transition-all duration-700 ${visibleSections.has('stats-section') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
        >
          {[
            { value: '50%', label: 'Reduced wait anxiety' },
            { value: '3x', label: 'Faster patient flow' },
            { value: '10k+', label: 'Patients served daily' },
            { value: '4.9/5', label: 'Clinic satisfaction' }
          ].map((stat, i) => (
            <div 
              key={stat.label} 
              className="text-center group hover:scale-110 hover:-translate-y-1 transition-all duration-300 cursor-default"
              style={{ transitionDelay: visibleSections.has('stats-section') ? `${i * 100}ms` : '0ms' }}
            >
              <div className="text-2xl sm:text-3xl md:text-4xl font-bold bg-gradient-to-br from-brand-600 to-cyan-500 bg-clip-text text-transparent group-hover:scale-105 transition-transform duration-300">{stat.value}</div>
              <div className="mt-1 text-xs sm:text-sm text-gray-600 group-hover:text-gray-900 transition-colors duration-300">{stat.label}</div>
            </div>
          ))}
        </section>

        {/* Problem/Solution */}
        <section 
          id="problems" 
          data-animate-section
          className={`mt-24 sm:mt-32 transition-all duration-700 ${visibleSections.has('problems') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
        >
          <div className="text-center mb-12 sm:mb-16">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-gray-900">From chaos to clarity</h2>
            <p className="mt-4 text-base sm:text-lg text-gray-600 max-w-2xl mx-auto">See how Waitfree transforms common clinic challenges</p>
          </div>

                    <div className="grid md:grid-cols-2 gap-6 sm:gap-8 max-w-6xl mx-auto">
                      <Card className="border border-gray-200/60 bg-white/80 backdrop-blur-sm hover:border-red-200 hover:shadow-sm transition-all duration-300">
                        <CardContent className="p-8">
                          <div className="flex items-center gap-3 mb-8">
                            <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center">
                              <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </div>
                            <h3 className="text-xl font-semibold text-gray-900">Common Pain Points</h3>
                          </div>
                          <ul className="space-y-5">
                            {['Anxious patients waiting with no updates', 'Staff overwhelmed with constant inquiries', 'No visibility into queue bottlenecks', 'Paper-based systems prone to errors', 'Difficulty coordinating across providers'].map((problem) => (
                              <li key={problem} className="flex gap-3 text-[15px] text-gray-600 leading-relaxed">
                                <svg className="w-5 h-5 text-red-400 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                                  <circle cx="10" cy="10" r="8" />
                                  <path fill="white" d="M6 10h8" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                                </svg>
                                <span>{problem}</span>
                              </li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>
            <Card className="border border-gray-200/60 bg-gradient-to-br from-emerald-50/40 to-cyan-50/40 backdrop-blur-sm hover:border-emerald-200 hover:shadow-sm transition-all duration-300">
              <CardContent className="p-8">
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center">
                    <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900">Waitfree Solutions</h3>
                </div>
                <ul className="space-y-5">
                  {['Real-time status updates keep patients informed', 'Automated notifications reduce staff burden', 'Live analytics identify and resolve delays', 'Digital-first system eliminates manual errors', 'Unified dashboard syncs entire team'].map((solution) => (
                    <li key={solution} className="flex gap-3 text-[15px] text-gray-600 leading-relaxed">
                      <svg className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <circle cx="10" cy="10" r="8" />
                        <path fill="white" d="M7 10l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span>{solution}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Bento Grid Features */}
        <section id="features" data-animate-section className="mt-24 sm:mt-32">
          <div className={`text-center mb-12 sm:mb-16 transition-all duration-700 ${visibleSections.has('features') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-gray-900">Built for modern clinics</h2>
            <p className="mt-4 text-base sm:text-lg text-gray-600 max-w-2xl mx-auto">Essential features that make patient flow management effortless</p>
          </div>
          
          <BentoGrid className={`${visibleSections.has('features') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}>
            <BentoCard
              name="Instant Queue Sync"
              className="col-span-3 lg:col-span-2"
              background={
                <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-8">
                  <div className="relative w-full h-full">
                    {/* Large grid covering more space */}
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 sm:gap-4 opacity-70">
                      {[...Array(12)].map((_, i) => (
                        <div
                          key={i}
                          className="h-12 sm:h-20 rounded-lg bg-gray-950/[.01] border border-gray-950/[.1] hover:bg-gray-950/[.05] dark:bg-gray-50/[.10] dark:border-gray-50/[.1] dark:hover:bg-gray-50/[.15] shadow-sm animate-pulse backdrop-blur-sm"
                          style={{ animationDelay: `${i * 0.15}s` }}
                        />
                      ))}
                    </div>
                    {/* Sync waves overlay */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="relative">
                        {[1, 2, 3].map((i) => (
                          <div
                            key={i}
                            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 sm:w-32 h-20 sm:h-32 rounded-full border-2 border-emerald-500/30 animate-ping"
                            style={{ 
                              animationDelay: `${i * 0.5}s`,
                              animationDuration: '2s',
                              scale: i * 0.5
                            }}
                          />
                        ))}
                        <div className="relative w-12 sm:w-16 h-12 sm:h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center">
                          <svg className="w-6 sm:w-8 h-6 sm:h-8 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                        </div>
                      </div>
                    </div>
                    {/* Live sync indicator - hidden on mobile to prevent overlap */}
                    <div className="hidden sm:flex absolute bottom-6 right-6 items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400 bg-white/80 dark:bg-gray-800/80 px-3 py-1.5 rounded-full backdrop-blur-sm">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                      <span>Live Sync Active</span>
                    </div>
                  </div>
                </div>
              }
              Icon={() => (
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
              )}
              description="Every status change updates across all devices instantly. Your team always sees the same real-time view."
            />
            <BentoCard
              name="WhatsApp Alerts"
              className="col-span-3 lg:col-span-1"
              background={
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="relative space-y-3 scale-75 [mask-image:linear-gradient(to_bottom,transparent_0%,#000_30%,#000_70%,transparent_100%)]">
                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 bg-gray-950/[.01] border border-gray-950/[.1] hover:bg-gray-950/[.05] dark:bg-gray-50/[.10] dark:border-gray-50/[.1] dark:hover:bg-gray-50/[.15] rounded-lg p-4 shadow-sm animate-[slideIn_0.5s_ease-out]"
                        style={{ animationDelay: `${i * 0.3}s`, animationFillMode: 'backwards' }}
                      >
                        <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                          <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                          </svg>
                        </div>
                        <div className="flex-1 h-2 bg-gray-950/[.05] dark:bg-gray-50/[.10] rounded" />
                      </div>
                    ))}
                  </div>
                </div>
              }
              Icon={() => (
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-green-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                </div>
              )}
              description="Patients get notified automatically when they join the queue and when it's their turn."
            />
            <BentoCard
              name="Token System"
              className="col-span-3 lg:col-span-1"
              background={
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="relative grid grid-cols-2 gap-2 scale-75 [mask-image:linear-gradient(to_bottom,transparent_10%,#000_40%,#000_60%,transparent_90%)]">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                      <div
                        key={i}
                        className="w-16 h-16 rounded-xl bg-gray-950/[.01] border-2 border-gray-950/[.1] hover:bg-gray-950/[.05] dark:bg-gray-50/[.10] dark:border-gray-50/[.1] dark:hover:bg-gray-50/[.15] flex items-center justify-center font-bold text-xl text-gray-700 dark:text-gray-300 shadow-sm animate-[fadeIn_0.5s_ease-out]"
                        style={{ animationDelay: `${i * 0.15}s`, animationFillMode: 'backwards' }}
                      >
                        {i}
                      </div>
                    ))}
                  </div>
                </div>
              }
              Icon={() => (
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                  </svg>
                </div>
              )}
              description="Simple numbered tokens keep the queue organized and easy to follow for staff and patients."
            />
            <BentoCard
              name="Multi-Status Tracking"
              className="col-span-3 lg:col-span-1"
              background={
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="relative space-y-2 scale-75 [mask-image:linear-gradient(to_bottom,transparent_10%,#000_30%,#000_70%,transparent_90%)]">
                    {[
                      { label: 'Waiting', color: 'bg-amber-500', count: 3 },
                      { label: 'In Progress', color: 'bg-blue-500', count: 1 },
                      { label: 'Completed', color: 'bg-green-500', count: 5 },
                    ].map((status, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 bg-gray-950/[.01] border border-gray-950/[.1] hover:bg-gray-950/[.05] dark:bg-gray-50/[.10] dark:border-gray-50/[.1] dark:hover:bg-gray-50/[.15] rounded-lg px-3 py-2.5 shadow-sm animate-[slideInRight_0.5s_ease-out]"
                        style={{ animationDelay: `${i * 0.2}s`, animationFillMode: 'backwards' }}
                      >
                        <div className={`w-3 h-3 rounded-full ${status.color}`} />
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300 flex-1">{status.label}</span>
                        <span className="text-xs font-bold text-gray-900 dark:text-gray-100">{status.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              }
              Icon={() => (
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500/20 to-purple-500/20 flex items-center justify-center text-violet-600 dark:text-violet-400">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                </div>
              )}
              description="Track patients through waiting, in-progress, completed, and cancelled states effortlessly."
            />
            <BentoCard
              name="Multi-Doctor Support"
              className="col-span-3 lg:col-span-1"
              background={
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="relative flex gap-2 scale-75 [mask-image:linear-gradient(to_bottom,transparent_20%,#000_40%,#000_60%,transparent_80%)]">
                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="flex flex-col items-center gap-2 bg-gray-950/[.01] border border-gray-950/[.1] hover:bg-gray-950/[.05] dark:bg-gray-50/[.10] dark:border-gray-50/[.1] dark:hover:bg-gray-50/[.15] rounded-lg p-4 shadow-sm animate-[fadeInUp_0.5s_ease-out]"
                        style={{ animationDelay: `${i * 0.2}s`, animationFillMode: 'backwards' }}
                      >
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500/30 to-purple-500/30" />
                        <div className="w-16 h-2 bg-gray-950/[.05] dark:bg-gray-50/[.10] rounded" />
                        <div className="w-12 h-1.5 bg-gray-950/[.05] dark:bg-gray-50/[.10] rounded" />
                      </div>
                    ))}
                  </div>
                </div>
              }
              Icon={() => (
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-blue-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
              )}
              description="Manage separate queues for multiple doctors in one clinic seamlessly."
            />
          </BentoGrid>
        </section>

        {/* How it works */}
        <section id="how" data-animate-section className={`mt-24 sm:mt-32 transition-all duration-700 ${visibleSections.has('how') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}>
          <div className="text-center mb-12 sm:mb-16">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-gray-900">Simple setup, powerful results</h2>
            <p className="mt-4 text-base sm:text-lg text-gray-600 max-w-2xl mx-auto">Get started in three easy steps</p>
          </div>
          
          <div className="grid sm:grid-cols-3 gap-8 sm:gap-6 max-w-5xl mx-auto">
            {[
              { num: '1', title: 'Sign up', desc: 'Create your account in seconds—no credit card needed.' },
              { num: '2', title: 'Configure', desc: 'Set up your clinic profile and invite your team.' },
              { num: '3', title: 'Go live', desc: 'Start managing patient flow and tracking metrics immediately.' }
            ].map((step, i) => (
              <div 
                key={step.num} 
                className={`relative text-center group hover:-translate-y-2 transition-all duration-300 ${visibleSections.has('how') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
                style={{ transitionDelay: visibleSections.has('how') ? `${i * 150}ms` : '0ms' }}
              >
                <div className="inline-flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-brand-500 to-cyan-500 text-white font-bold text-lg sm:text-xl mb-4 group-hover:scale-110 transition-transform duration-300 shadow-lg">{step.num}</div>
                <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">{step.title}</h3>
                <p className="text-sm sm:text-base text-gray-600 leading-relaxed">{step.desc}</p>
                {i < 2 && <div className="hidden sm:block absolute top-6 sm:top-7 left-[60%] w-[80%] h-0.5 bg-gradient-to-r from-brand-300 to-transparent" />}
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section id="contact" data-animate-section className={`mt-32 sm:mt-40 flex flex-col items-center text-center transition-all duration-700 ${visibleSections.has('contact') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}>
          <div className="relative">
            <div className="absolute -inset-4 bg-gradient-to-r from-brand-500/20 to-cyan-500/20 blur-2xl -z-10 animate-pulse" />
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-gray-900">Ready to transform your clinic?</h2>
          </div>
          <p className="mt-4 text-sm sm:text-base text-gray-600 max-w-xl leading-relaxed px-4">Join forward-thinking healthcare providers who are improving patient experiences every day.</p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 sm:gap-4 w-full sm:w-auto px-4 sm:px-0">
            {!user && (
              <>
                <Button size="lg" onClick={() => router.push('/auth/signup')} className="w-full sm:w-auto justify-center hover:scale-105 transition-transform duration-300">Sign up free</Button>
                <Button variant="outline" size="lg" onClick={() => router.push('/auth/login')} className="w-full sm:w-auto justify-center hover:scale-105 transition-transform duration-300">Sign in</Button>
              </>
            )}
            {user && !isMapped && <Button size="lg" variant="accent" onClick={() => router.push('/dashboard')} className="w-full sm:w-auto justify-center hover:scale-105 transition-transform duration-300">Complete Setup</Button>}
            {user && isMapped && <Button size="lg" variant="secondary" onClick={() => router.push('/dashboard')} className="w-full sm:w-auto justify-center hover:scale-105 transition-transform duration-300">Dashboard</Button>}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className={`mt-auto border-t border-white/50 bg-white/70 backdrop-blur-xl transition-all duration-700 ${mounted ? 'opacity-100' : 'opacity-0'}`} style={{ transitionDelay: '1700ms' }}>
        <div className="mx-auto max-w-6xl px-6 py-12 space-y-10">
          <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
            <div className="space-y-4 max-w-sm">
              <Logo className="text-gray-900" />
              <p className="text-xs leading-relaxed text-gray-600">Building a calmer healthcare access experience – transparent, efficient & human.</p>
              <div className="space-y-2 text-xs text-gray-600">
                <div className="flex items-center gap-2">
                  <svg className="h-4 w-4 text-brand-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path d="M3 4a2 2 0 00-2 2v1.161l8.441 4.221a1.25 1.25 0 001.118 0L19 7.162V6a2 2 0 00-2-2H3z" />
                    <path d="M19 8.839l-7.77 3.885a2.75 2.75 0 01-2.46 0L1 8.839V14a2 2 0 002 2h14a2 2 0 002-2V8.839z" />
                  </svg>
                  <span>docsetu.services@gmail.com</span>
                </div>
                <div className="flex items-center gap-2">
                  <svg className="h-4 w-4 text-brand-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M2 4a2 2 0 012-2h2.278a1 1 0 01.948.684l1.105 3.316a1 1 0 01-.502 1.2l-1.357.743a11.037 11.037 0 005.516 5.516l.743-1.357a1 1 0 011.2-.502l3.316 1.105a1 1 0 01.684.949V16a2 2 0 01-2 2h-1C7.82 18 2 12.18 2 5V4z" clipRule="evenodd" />
                  </svg>
                  <span>+91-8817244374</span>
                </div>
              </div>
            </div>
            <nav className="flex flex-wrap gap-x-10 gap-y-4 text-[11px] font-medium tracking-wide text-gray-600">
              <a href="#privacy" className="hover:text-gray-900 transition-colors">Privacy Policy</a>
              <a href="#terms" className="hover:text-gray-900 transition-colors">Terms of Service</a>
              <a href="#contact" className="hover:text-gray-900 transition-colors">Contact</a>
            </nav>
          </div>
          <div className="flex flex-col-reverse items-center justify-between gap-4 border-t border-gray-200/70 pt-6 text-[11px] text-gray-500 md:flex-row">
            <p>&copy; {new Date().getFullYear()} Waitfree Health Technologies Pvt. Ltd. | All Rights Reserved</p>
            <p className="flex items-center gap-2 font-medium"><span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>Realtime</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
