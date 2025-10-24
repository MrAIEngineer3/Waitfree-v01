"use client";
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardContent } from '../../components/ui/Card';
import { auth, db } from '../../lib/firebase';
import Logo from '../../components/Logo';

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
  const socialLinks = [
    { label: 'LinkedIn', href: 'https://www.linkedin.com', icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
        <path d="M4.98 3.5C4.98 4.88 3.88 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1s2.48 1.12 2.48 2.5zM.24 8.25h4.52V24H.24zM8.54 8.25h4.33v2.14h.06c.6-1.14 2.07-2.33 4.26-2.33 4.55 0 5.39 3 5.39 6.91V24h-4.7v-7.76c0-1.85-.03-4.23-2.58-4.23-2.58 0-2.98 2.02-2.98 4.1V24h-4.7z" />
      </svg>
    ) },
    { label: 'Instagram', href: 'https://www.instagram.com', icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
        <path d="M7 2C4.243 2 2 4.243 2 7v10c0 2.757 2.243 5 5 5h10c2.757 0 5-2.243 5-5V7c0-2.757-2.243-5-5-5H7zm0 2h10c1.654 0 3 1.346 3 3v10c0 1.654-1.346 3-3 3H7c-1.654 0-3-1.346-3-3V7c0-1.654 1.346-3 3-3zm10 1.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM12 7a5 5 0 100 10 5 5 0 000-10zm0 2a3 3 0 110 6 3 3 0 010-6z" />
      </svg>
    ) },
    { label: 'YouTube', href: 'https://www.youtube.com', icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
        <path d="M21.8 8.001a2.748 2.748 0 00-1.936-1.949C18.225 5.666 12 5.666 12 5.666s-6.225 0-7.864.386A2.748 2.748 0 002.2 8.001C1.82 9.657 1.82 12 1.82 12s0 2.343.38 3.999a2.748 2.748 0 001.936 1.949c1.639.386 7.864.386 7.864.386s6.225 0 7.864-.386a2.748 2.748 0 001.936-1.949c.38-1.656.38-3.999.38-3.999s0-2.343-.38-3.999zM10.2 14.567V9.433L14.73 12l-4.53 2.567z" />
      </svg>
    ) }
  ];
  const footerNav = [
    {
      title: 'Product',
      links: [
        { label: 'Overview', href: '#features' },
        { label: 'Live demos', href: '#how' },
        { label: 'Pricing', href: '#contact' },
        { label: 'Security', href: '#features' }
      ]
    },
    {
      title: 'Resources',
      links: [
        { label: 'Implementation', href: '#how' },
        { label: 'Guides', href: '#problems' },
        { label: 'Status', href: '#stats-section' },
        { label: 'Support', href: '#contact' }
      ]
    },
    {
      title: 'Company',
      links: [
        { label: 'About', href: '#main' },
        { label: 'Careers', href: '#contact' },
        { label: 'Press', href: '#features' },
        { label: 'Legal', href: '#privacy' }
      ]
    }
  ];

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

          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden p-2 text-gray-600 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500 rounded-md" aria-expanded={mobileMenuOpen} aria-label="Toggle menu">
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
                      <Card className="border-2 border-red-100 hover:border-red-200/60 hover:shadow-md hover:-translate-y-0.5 transition-all duration-[800ms] ease-out">
                        <CardContent className="p-6">
                          <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-red-100 flex items-center justify-center text-red-600">
                              <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </div>
                            <h3 className="text-lg sm:text-xl font-bold text-gray-900">Common Pain Points</h3>
                          </div>
                          <ul className="space-y-4">
                            {['Anxious patients waiting with no updates', 'Staff overwhelmed with constant inquiries', 'No visibility into queue bottlenecks', 'Paper-based systems prone to errors', 'Difficulty coordinating across providers'].map((problem) => (
                              <li key={problem} className="flex gap-3 text-sm sm:text-base text-gray-700">
                                <svg className="w-5 h-5 text-red-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                </svg>
                                <span>{problem}</span>
                              </li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>
            <Card className="border-2 border-green-100 bg-gradient-to-br from-green-50/50 to-cyan-50/50 hover:border-green-200/60 hover:shadow-md hover:-translate-y-0.5 transition-all duration-[800ms] ease-out">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-green-100 flex items-center justify-center text-green-600">
                    <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="text-lg sm:text-xl font-bold text-gray-900">Waitfree Solutions</h3>
                </div>
                <ul className="space-y-4">
                  {['Real-time status updates keep patients informed', 'Automated notifications reduce staff burden', 'Live analytics identify and resolve delays', 'Digital-first system eliminates manual errors', 'Unified dashboard syncs entire team'].map((solution) => (
                    <li key={solution} className="flex gap-3 text-sm sm:text-base text-gray-700">
                      <svg className="w-5 h-5 text-green-600 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
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
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-gray-900">Everything you need</h2>
            <p className="mt-4 text-base sm:text-lg text-gray-600 max-w-2xl mx-auto">Powerful features designed to transform your clinic operations</p>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            <Card 
              className={`sm:col-span-2 lg:col-span-2 h-full flex flex-col hover:shadow-lg hover:-translate-y-0.5 hover:scale-[1.005] transition-all duration-[900ms] ease-out group border border-transparent hover:border-white/40 bg-gradient-to-br from-blue-50/50 to-cyan-50/50 ${visibleSections.has('features') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
              style={{ transitionDelay: visibleSections.has('features') ? '100ms' : '0ms' }}
            >
              <CardContent className="p-6">
                <div className="flex items-start gap-4 mb-6">
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-yellow-500 to-orange-500 flex items-center justify-center text-white group-hover:scale-[1.03] group-hover:rotate-1 transition-all duration-700 ease-out shadow-xl">
                    <svg className="w-7 h-7 sm:w-8 sm:h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3">Real-time Updates</h3>
                    <p className="text-sm sm:text-base text-gray-600 leading-relaxed">Lightning-fast synchronization keeps your entire team aligned. See changes as they happen with zero lag.</p>
                  </div>
                </div>
                <div className="mt-auto pt-6 border-t border-gray-200/50">
                  <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-500">
                    <div className="flex-1 h-2 bg-gradient-to-r from-yellow-200 to-orange-200 rounded-full overflow-hidden">
                      <div className="h-full w-3/4 bg-gradient-to-r from-yellow-500 to-orange-500 animate-[shimmer_2s_ease-in-out_infinite]" />
                    </div>
                    <span>Live sync</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {[
              { icon: (<svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>), gradient: 'from-blue-500 to-cyan-500', title: 'Smart Analytics', body: 'Track key metrics and identify bottlenecks with actionable insights.', span: 'sm:col-span-1' },
              { icon: (<svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>), gradient: 'from-pink-500 to-rose-500', title: 'Better Experience', body: 'Keep patients informed with transparent wait times and clear updates.', span: 'sm:col-span-1' },
              { icon: (<svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>), gradient: 'from-green-500 to-emerald-500', title: 'Secure & Private', body: 'Built with privacy-first design and enterprise-grade security.', span: 'sm:col-span-1' },
              { icon: (<svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>), gradient: 'from-purple-500 to-indigo-500', title: 'Easy Integration', body: 'Connect with your existing systems through our flexible API.', span: 'sm:col-span-1 lg:col-span-2' },
              { icon: (<svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>), gradient: 'from-teal-500 to-cyan-500', title: 'Scales with You', body: 'From single clinics to multi-location practices, we grow with you.', span: 'sm:col-span-1' }
            ].map((card, i) => (
              <Card 
                key={card.title} 
                className={`${card.span} h-full min-h-[200px] sm:min-h-[220px] flex flex-col hover:shadow-md hover:-translate-y-0.5 hover:scale-[1.005] transition-all duration-[900ms] ease-out group border border-transparent hover:border-white/40 ${visibleSections.has('features') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
                style={{ transitionDelay: visibleSections.has('features') ? `${200 + i * 100}ms` : '0ms' }}
              >
                <CardContent className="p-4">
                  <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-gradient-to-br ${card.gradient} flex items-center justify-center text-white mb-4 group-hover:scale-[1.03] group-hover:rotate-2 transition-all duration-700 ease-out shadow-lg`}>
                    {card.icon}
                  </div>
                  <h3 className="text-base sm:text-lg font-semibold text-gray-800 mb-2">{card.title}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed flex-1">{card.body}</p>
                </CardContent>
              </Card>
            ))}
          </div>
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
      <footer className={`relative mt-auto overflow-hidden bg-gradient-to-b from-white/90 to-slate-50/90 backdrop-blur-xl border-t border-white/60 shadow-[0_-20px_60px_-40px_rgba(15,23,42,0.45)] transition-all duration-700 ${mounted ? 'opacity-100' : 'opacity-0'}`} style={{ transitionDelay: '1700ms' }}>
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-200 to-transparent" aria-hidden="true" />

        <div className="max-w-7xl mx-auto px-4 sm:px-5 py-12 sm:py-16">
          <div className="relative overflow-hidden rounded-2xl border border-white/40 bg-white/90 shadow-lg p-6 sm:p-8 lg:p-10 flex flex-col lg:flex-row lg:items-center gap-6 lg:gap-10 mb-12">
            <div className="absolute inset-0 -z-10 bg-gradient-to-r from-brand-100/70 via-cyan-100/50 to-sky-100/60 opacity-90" aria-hidden="true" />
            <div className="flex-1">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/80 px-3 py-1 text-xs font-medium text-brand-700 shadow-sm mb-4">Stay in the loop</div>
              <h3 className="text-xl sm:text-2xl font-semibold text-gray-900">Monthly product drops, beta invites, and workflow tips.</h3>
              <p className="mt-2 text-sm sm:text-base text-gray-600 max-w-xl">We only send the essentials. Unsubscribe in a click.</p>
            </div>
            <form className="w-full max-w-md flex flex-col sm:flex-row gap-3" onSubmit={(event) => event.preventDefault()}>
              <label htmlFor="footer-email" className="sr-only">Email address</label>
              <input
                id="footer-email"
                type="email"
                placeholder="you@clinic.com"
                className="flex-1 rounded-xl border border-brand-200 bg-white/90 px-4 py-3 sm:py-2.5 lg:h-10 lg:py-0 text-sm text-gray-700 placeholder:text-gray-400 shadow-inner focus:border-brand-400 focus:ring-2 focus:ring-brand-200 sm:max-w-[260px] lg:max-w-[240px]"
                required
              />
              <Button type="submit" size="lg" className="w-full sm:w-auto justify-center sm:h-11 lg:h-10">Notify me</Button>
            </form>
            <div className="hidden lg:flex items-center gap-3 text-left">
              <svg className="w-10 h-10 text-emerald-500" viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <circle cx="24" cy="24" r="18" opacity="0.2" fill="currentColor" />
                <path d="M17 24l5 5 9-11" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} />
              </svg>
              <div className="text-sm text-gray-600">
                <span className="font-semibold text-gray-900">Trusted by 120+ clinics</span>
                <br />Zero-commitment opt-out anytime.
              </div>
            </div>
          </div>

          <div className="grid gap-10 lg:grid-cols-4 text-sm text-gray-600">
            <div className="space-y-4">
              <Logo className="text-gray-900" textClassName="text-base" />
              <p className="leading-relaxed text-gray-600">Waitlist orchestration for high-performing healthcare teams. Measure, iterate, and deliver calmer patient journeys.</p>
              <div className="flex gap-3">
                {socialLinks.map((item) => (
                  <a key={item.label} href={item.href} target="_blank" rel="noopener noreferrer" className="flex h-10 w-10 items-center justify-center rounded-full border border-white/60 bg-white/70 text-gray-500 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:text-brand-600 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-300">
                    <span className="sr-only">{item.label}</span>
                    {item.icon}
                  </a>
                ))}
              </div>
            </div>

            {footerNav.map((group) => (
              <div key={group.title} className="space-y-4">
                <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-900">{group.title}</h4>
                <ul className="space-y-2">
                  {group.links.map((link) => (
                    <li key={link.label}>
                      <a href={link.href} className="inline-flex items-center gap-2 text-gray-600 transition-colors duration-200 hover:text-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-300 rounded">
                        <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-r from-brand-400 to-cyan-400" aria-hidden="true" />
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            <div className="space-y-4">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-900">Need a demo?</h4>
              <p className="leading-relaxed text-gray-600">Book a walkthrough with our onboarding specialists to see Waitfree in action.</p>
              <div className="space-y-2 text-gray-600">
                <div className="flex items-center gap-2">
                  <svg className="h-4 w-4 text-brand-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path d="M2.94 6.94a1.5 1.5 0 000 2.12l6 6a1.5 1.5 0 002.12 0l6-6a1.5 1.5 0 00-2.12-2.12L10 11.88 5.06 6.94a1.5 1.5 0 00-2.12 0z" />
                  </svg>
                  <span>support@waitfree.app</span>
                </div>
                <div className="flex items-center gap-2">
                  <svg className="h-4 w-4 text-brand-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M2 4a2 2 0 012-2h2.278a1 1 0 01.948.684l1.105 3.316a1 1 0 01-.502 1.2l-1.357.743a11.037 11.037 0 005.516 5.516l.743-1.357a1 1 0 011.2-.502l3.316 1.105a1 1 0 01.684.949V16a2 2 0 01-2 2h-1C7.82 18 2 12.18 2 5V4z" clipRule="evenodd" />
                  </svg>
                  <span>(415) 555-0197</span>
                </div>
              </div>
              <Button variant="secondary" size="sm" className="inline-flex items-center gap-2">
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12.25 4.25l3.5 3.5-8.5 8.5H3.75v-3.5l8.5-8.5z" />
                </svg>
                Schedule a call
              </Button>
            </div>
          </div>

          <div className="mt-12 border-t border-white/60 pt-6 text-xs sm:text-sm text-gray-500 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>&copy; {new Date().getFullYear()} Waitfree. All rights reserved.</div>
            <div className="flex flex-wrap gap-4 sm:gap-6">
              <a href="#privacy" className="hover:text-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-300 rounded">Privacy</a>
              <a href="#terms" className="hover:text-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-300 rounded">Terms</a>
              <a href="#contact" className="hover:text-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-300 rounded">Contact</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
