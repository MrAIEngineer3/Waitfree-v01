"use client";
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { buildJoinHref, parseClinicIdentifierFromText } from '@/lib/clinicIdentifier';
import { Loader2 } from 'lucide-react';
import { useJoinScanner } from './components/JoinScannerProvider';

// ===== CLINIC CODE ENTRY =====
function ClinicIdEntry() {
  const router = useRouter();
  const [clinicId, setClinicId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPending, startTransition] = useTransition();

  const goToJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = clinicId.trim();
    if (!trimmed) {
      return;
    }

    const parsed = parseClinicIdentifierFromText(trimmed, { preferSlugOnAmbiguous: true });
    const destination = parsed ? buildJoinHref(parsed) : `/join?clinicId=${encodeURIComponent(trimmed)}`;

    setIsSubmitting(true);

    startTransition(() => {
      router.push(destination);
    });
  };

  return (
    <form onSubmit={goToJoin} className="flex w-full max-w-xs items-center gap-2">
      <Input
        type="text"
        placeholder="Enter clinic code"
        value={clinicId}
        onChange={(event) => setClinicId(event.target.value)}
        className="h-12 rounded-full bg-background/90 backdrop-blur-sm border-border/50 pl-5 pr-4 text-sm shadow-md focus-visible:shadow-lg focus-visible:ring-primary/50 transition-all"
      />
      <Button
        type="submit"
        size="lg"
        variant="accent"
        className="h-12 rounded-full px-8 shadow-lg hover:scale-[1.02] transition-transform"
        aria-label="Go to clinic"
        disabled={isSubmitting || isPending || !clinicId.trim()}
      >
        {isSubmitting || isPending ? (
          <span className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Joining…
          </span>
        ) : (
          'Go'
        )}
      </Button>
    </form>
  );
}

// ===== SCROLL ANIMATION HOOK =====
function useScrollAnimation() {
  useEffect(() => {
    const animatedElements = document.querySelectorAll('.scroll-animation');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animate');
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.1,
    });
    
    animatedElements.forEach(el => {
      observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);
}

// ===== HERO SECTION =====
function HeroSection() {
  const { openScanner } = useJoinScanner();

  return (
    <section className="pt-8 sm:pt-12 pb-16 sm:pb-20 text-center">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <a
          href="#features"
          className="inline-block animate-on-load hero-item-animate"
          style={{ animationDelay: '0.2s' }}
        >
          <Badge
            variant="secondary"
            className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 backdrop-blur-sm px-4 py-1.5 text-xs font-medium shadow-sm transition-all hover:shadow-md hover:scale-105"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
              <span className="relative inline-flex h-full w-full rounded-full bg-primary" />
            </span>
            <span className="hidden sm:inline">Introducing our Queue Intelligence Platform</span>
            <span className="sm:hidden">New Queue Intelligence Platform</span>
          </Badge>
        </a>
        <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tighter text-gray-900 leading-[1.1] mt-6 animate-on-load hero-item-animate" style={{animationDelay: '0.4s'}}>
          The Waiting Room, <br /> <span className="wf-gradient-text">Reimagined.</span>
        </h1>
        <p className="max-w-2xl mx-auto mt-6 text-base sm:text-lg text-gray-600 leading-relaxed animate-on-load hero-item-animate" style={{animationDelay: '0.6s'}}>
          Your clinic journey simplified. Discover, book, and track your turn from anywhere. Arrive just-in-time, stress-free.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 animate-on-load hero-item-animate" style={{animationDelay: '0.8s'}}>
          <Button
            type="button"
            size="lg"
            variant="accent"
            className="h-12 rounded-full px-8 shadow-xl hover:shadow-2xl hover:scale-[1.02] transition-all"
            onClick={openScanner}
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
            Scan QR Code
          </Button>
          <ClinicIdEntry />
        </div>
      </div>
    </section>
  );
}

// ===== PHONE MOCKUP SECTION =====
function PhoneMockupSection() {
  return (
    <section className="relative pt-20 sm:pt-24 pb-12 sm:pb-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="scroll-animation relative w-full max-w-4xl mx-auto h-[400px] sm:h-[600px] flex items-center justify-center">
        {/* Phone Frame */}
        <div className="relative w-72 sm:w-80 h-[580px] sm:h-[620px] bg-gray-900 rounded-[48px] border-[14px] border-gray-900 shadow-2xl shadow-black/30 overflow-hidden ring-1 ring-white/10">
          {/* Phone Screen Content */}
          <div className="w-full h-full bg-gradient-to-b from-blue-50 to-white flex flex-col">
            {/* Header */}
            <div className="p-4 bg-gradient-to-r from-blue-50 to-cyan-50 border-b border-gray-200/50">
              <p className="text-xs font-semibold tracking-wider text-primary">LIVE QUEUE</p>
              <h3 className="text-lg font-bold text-gray-900">City General Hospital</h3>
            </div>
            {/* Queue Info */}
            <div className="flex-grow p-6 flex flex-col justify-center items-center text-center space-y-6">
              <p className="text-sm font-medium text-gray-500">Your Turn</p>
              <div className="text-7xl font-extrabold wf-gradient-text">24</div>
              <p className="text-sm text-gray-600">Est. Wait: <span className="font-bold text-gray-900">15 mins</span></p>
            </div>
            {/* Current Patient */}
            <div className="p-4 m-4 bg-gradient-to-br from-primary/10 to-cyan-500/10 rounded-2xl border-2 border-primary/20 text-center shadow-lg">
              <p className="text-sm font-semibold text-primary">Now Serving</p>
              <p className="text-3xl font-bold text-primary mt-1">21</p>
            </div>
          </div>
        </div>

        {/* Floating Cards - Hidden on mobile to prevent overlap */}
        <div className="hidden md:block absolute -top-10 -left-4 sm:-left-20 w-40 sm:w-64 glass-card p-5 rounded-2xl shadow-xl border border-white/20 transition-all hover:scale-105 hover:shadow-2xl">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7"></path>
              </svg>
            </div>
            <div>
              <p className="font-semibold text-sm text-gray-900">Checked In!</p>
              <p className="text-xs text-gray-600">You&apos;re in the queue.</p>
            </div>
          </div>
        </div>
        <div className="hidden md:block absolute top-1/3 -right-4 sm:-right-24 w-40 sm:w-64 glass-card p-5 rounded-2xl shadow-xl border border-white/20 transition-all hover:scale-105 hover:shadow-2xl">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-cyan-400 to-cyan-600 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path>
              </svg>
            </div>
            <div>
              <p className="font-semibold text-sm text-gray-900">It&apos;s almost time!</p>
              <p className="text-xs text-gray-600">Please head to the clinic.</p>
            </div>
          </div>
        </div>
      </div>
      </div>
    </section>
  );
}

// ===== FEATURES SECTION =====
function FeaturesSection() {
  const features = [
    {
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 6v6l4 2"/>
        </svg>
      ),
      title: 'Real-time Tracking',
      description: 'Monitor your precise position in the queue live, from your phone, anywhere you are.'
    },
    {
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5.52 19c.64-2.2 1.84-3 3.22-3h6.52c1.38 0 2.58.8 3.22 3"/>
          <circle cx="12" cy="9" r="3"/>
          <circle cx="19" cy="9" r="3"/>
          <path d="M5 9a3 3 0 0 0-3 3v0a3 3 0 0 0 3 3"/>
        </svg>
      ),
      title: 'Transparent Flow',
      description: 'No more guesswork. See exactly how many patients are ahead of you at any moment.'
    },
    {
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 14V2H7l-5 5v15h15z"/>
          <path d="M12 18v-6"/>
          <path d="M9 15h6"/>
        </svg>
      ),
      title: 'Smart Notifications',
  description: 'Receive timely alerts when it’s almost your turn, so you can arrive just-in-time.'
    }
  ];

  return (
    <section id="features" className="py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16 scroll-animation">
        <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-gray-900">A smarter way to wait.</h2>
        <p className="max-w-2xl mx-auto mt-4 text-base sm:text-lg text-gray-600">Waitfree empowers you with features that put you in control.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
        {features.map((feature, index) => (
          <Card
            key={feature.title}
            className="scroll-animation group border-border/40 bg-card/80 backdrop-blur-sm shadow-lg hover:shadow-2xl hover:scale-[1.02] transition-all duration-300"
            style={{ transitionDelay: `${index * 100}ms` }}
          >
            <CardContent className="space-y-4 p-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 text-primary ring-1 ring-primary/10 group-hover:scale-110 transition-transform">
                {feature.icon}
              </div>
              <h3 className="text-lg font-semibold text-foreground">{feature.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      </div>
    </section>
  );
}

// ===== HOW IT WORKS SECTION =====
function HowItWorksSection() {
  const steps = [
    {
      number: 1,
      title: 'Scan or Enter Code',
      description: 'Join the queue instantly by scanning the clinic\'s QR code or entering their share code.'
    },
    {
      number: 2,
      title: 'Relax & Track',
      description: 'Go about your day. We\'ll keep you updated on your queue status in real-time on your phone.'
    },
    {
      number: 3,
      title: 'Arrive Just-in-Time',
      description: 'Get a notification when your turn is approaching. Head to the clinic and be seen without the wait.'
    }
  ];

  return (
    <section id="how-it-works" className="py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16 scroll-animation">
        <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-gray-900">Get started in 3 easy steps.</h2>
        <p className="max-w-2xl mx-auto mt-4 text-base sm:text-lg text-gray-600">Your journey to a stress-free clinic visit is simple.</p>
      </div>
      <div className="relative">
        {/* Dotted Line for Desktop */}
        <div className="hidden lg:block absolute top-1/2 left-0 w-full h-0.5 border-t-2 border-dashed border-primary/20 -translate-y-1/2" aria-hidden />
        
        <div className="relative grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-6">
          {steps.map((step, index) => (
            <Card
              key={step.number}
              className="scroll-animation group border-border/40 bg-card/80 backdrop-blur-sm text-center shadow-lg hover:shadow-2xl transition-all duration-300"
              style={{ transitionDelay: `${index * 150}ms` }}
            >
              <CardContent className="space-y-4 p-8">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-2xl font-bold text-white shadow-lg shadow-primary/30 ring-4 ring-primary/10 group-hover:scale-110 transition-transform">
                  {step.number}
                </div>
                <h3 className="text-lg font-semibold text-foreground">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
      </div>
    </section>
  );
}

// ===== CTA SECTION =====
function CtaSection() {
  return (
    <section className="py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="relative rounded-3xl overflow-hidden scroll-animation shadow-2xl">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900"></div>
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600/30 via-cyan-500/20 to-transparent"></div>
        <div className="relative text-center p-12 sm:p-20">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-white">Join the Future of Clinic Visits</h2>
          <p className="max-w-2xl mx-auto mt-6 text-base sm:text-lg text-gray-200">Experience calmer, smarter, patient-centric waiting. No guesswork, no crowding—just timely care.</p>
          <Button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            size="lg"
            variant="accent"
            className="mt-8 h-14 rounded-full px-10 text-base shadow-2xl hover:scale-105 transition-all"
          >
            Get Started for Free
          </Button>
        </div>
      </div>
      </div>
    </section>
  );
}

// ===== MAIN LANDING PAGE =====
export default function LandingPage() {
  useScrollAnimation();

  // Force scroll to top on page load/reload and prevent scroll restoration
  useEffect(() => {
    // Disable automatic scroll restoration
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }
    
    // Scroll to top immediately
    window.scrollTo(0, 0);
    
    // Also scroll to top after a brief delay to handle any layout shifts
    const timer = setTimeout(() => {
      window.scrollTo(0, 0);
    }, 100);

    return () => {
      clearTimeout(timer);
      // Restore scroll restoration on unmount
      if ('scrollRestoration' in history) {
        history.scrollRestoration = 'auto';
      }
    };
  }, []);

  return (
    <>
      <HeroSection />
      <PhoneMockupSection />
      <FeaturesSection />
      <HowItWorksSection />
      <CtaSection />
    </>
  );
}
