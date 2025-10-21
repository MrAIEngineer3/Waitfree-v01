"use client";
import { useRouter } from 'next/navigation';
import QrScanner from 'qr-scanner';
import { useEffect, useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

// ===== QR CODE SCANNER =====
interface QRCodeScannerProps {
  onScan: (result: string) => void;
  onError?: (error: Error) => void;
  onCancel?: () => void;
}

function QRCodeScanner({ onScan, onError, onCancel }: QRCodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const qrScannerRef = useRef<QrScanner | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const startingRef = useRef(false);
  const onScanRef = useRef(onScan);
  const onErrorRef = useRef(onError);

  // Keep latest handlers without re-initializing the scanner
  useEffect(() => { onScanRef.current = onScan; }, [onScan]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  useEffect(() => {
    mountedRef.current = true;
    let scanner: QrScanner | null = null;
    const initialVideoEl = videoRef.current;

    const initScanner = async () => {
      if (!videoRef.current || !mountedRef.current) return;
      if (startingRef.current) return; // prevent concurrent starts
      startingRef.current = true;

      try {
        setError(null);

        // Check if camera is available
        const hasCamera = await QrScanner.hasCamera();
        if (!hasCamera) {
          throw new Error('No camera found on this device');
        }

        // Small delay to ensure the video element is fully attached/rendered
        await new Promise(resolve => setTimeout(resolve, 80));

        if (!videoRef.current || !mountedRef.current) return;

        // Create scanner instance
        scanner = new QrScanner(
          videoRef.current,
          (result) => {
            if (!mountedRef.current) return;

            // Clean up scanner before calling onScan
            try {
              scanner?.stop();
              scanner?.destroy();
            } catch {}
            scanner = null;
            qrScannerRef.current = null;

            try { onScanRef.current?.(result.data); } catch (e) { console.error('onScan handler error', e); }
          },
          {
            // Prefer environment camera (rear camera)
            preferredCamera: 'environment',
            // Highlight code outline
            highlightScanRegion: true,
            highlightCodeOutline: true,
            // Return detailed scan result
            returnDetailedScanResult: true,
            // Calculate scan region for better performance
            calculateScanRegion: (video) => {
              const smallerDimension = Math.min(video.videoWidth, video.videoHeight);
              const regionSize = Math.round(0.7 * smallerDimension);
              return {
                x: Math.round((video.videoWidth - regionSize) / 2),
                y: Math.round((video.videoHeight - regionSize) / 2),
                width: regionSize,
                height: regionSize,
              };
            },
          }
        );

        if (!mountedRef.current) {
          try { scanner.destroy(); } catch {}
          startingRef.current = false;
          return;
        }

        qrScannerRef.current = scanner;

        // Start scanning (QrScanner controls video.play internally)
        await scanner.start();

        if (mountedRef.current) {
          setIsLoading(false);
        }
      } catch (error) {
        console.error('Failed to initialize QR scanner:', error);
        if (mountedRef.current) {
          setIsLoading(false);
          const errorMessage = error instanceof Error ? error.message : 'Failed to access camera';
          setError(errorMessage);
          try { onErrorRef.current?.(error as Error); } catch {}
        }
      } finally {
        startingRef.current = false;
      }
    };

    initScanner();

    // Cleanup function
    return () => {
      mountedRef.current = false;
      try {
        scanner?.stop();
        scanner?.destroy();
      } catch {}
      scanner = null;
      try {
        qrScannerRef.current?.stop();
        qrScannerRef.current?.destroy();
      } catch {}
      qrScannerRef.current = null;
      // Explicitly clear video srcObject to avoid lingering streams
      if (initialVideoEl) {
        try {
          initialVideoEl.srcObject = null;
        } catch {}
      }
    };
  }, []);

  const handleCancel = () => {
    mountedRef.current = false;
    if (qrScannerRef.current) {
      qrScannerRef.current.destroy();
      qrScannerRef.current = null;
    }
    onCancel?.();
  };

  const handleRetry = () => {
    // Reset state and attempt to (re)start
    setIsLoading(true);
    setError(null);
    mountedRef.current = true;
    // We rely on the initial effect to run once. For retry, imperatively start if instance exists.
    // If instance was destroyed due to error, we can create a fresh one by calling the same init path:
    // Re-run minimal init only when no instance is present.
    if (!qrScannerRef.current && videoRef.current && !startingRef.current) {
      // Kick the effect's init logic by creating a microtask that sets startingRef and builds the scanner
      // rather than duplicating logic here. The simplest safe approach is to trigger a tiny state tick
      // that doesn't remount but causes no heavy re-render.
      // However, our effect has empty deps, so we manually create an instance here mirroring init.
      (async () => {
        try {
          startingRef.current = true;
          const hasCamera = await QrScanner.hasCamera();
          if (!hasCamera) throw new Error('No camera found on this device');
          await new Promise(r => setTimeout(r, 80));
          if (!videoRef.current) return;
          const scanner = new QrScanner(
            videoRef.current,
            (result) => {
              try { scanner.stop(); scanner.destroy(); } catch {}
              qrScannerRef.current = null;
              try { onScanRef.current?.(result.data); } catch (e) { console.error('onScan handler error', e); }
            },
            {
              preferredCamera: 'environment',
              highlightScanRegion: true,
              highlightCodeOutline: true,
              returnDetailedScanResult: true,
              calculateScanRegion: (video) => {
                const smaller = Math.min(video.videoWidth, video.videoHeight);
                const size = Math.round(0.7 * smaller);
                return { x: Math.round((video.videoWidth - size) / 2), y: Math.round((video.videoHeight - size) / 2), width: size, height: size };
              },
            }
          );
          qrScannerRef.current = scanner;
          await scanner.start();
          setIsLoading(false);
        } catch (e) {
          console.error('Retry failed to initialize scanner', e);
          setIsLoading(false);
          setError(e instanceof Error ? e.message : 'Failed to access camera');
          try { onErrorRef.current?.(e as Error); } catch {}
        } finally {
          startingRef.current = false;
        }
      })();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-md">
      <Card className="w-full max-w-sm border-border/50 bg-card/95 backdrop-blur-sm shadow-2xl">
        <CardContent className="flex flex-col items-center gap-4 p-6">
          <div className="relative h-72 w-72 overflow-hidden rounded-2xl border-2 border-border/40 bg-black shadow-lg">
            <video
              ref={videoRef}
              className="h-full w-full object-cover"
              playsInline
              muted
            />
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm">
                <div className="h-10 w-10 animate-spin rounded-full border-3 border-primary border-t-transparent" />
              </div>
            )}
            {error && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
                <div className="space-y-2 text-center text-sm text-destructive">
                  <div className="text-2xl">⚠️</div>
                  <p className="font-medium">{error}</p>
                </div>
              </div>
            )}
          </div>
          <p className="text-center text-sm font-medium text-muted-foreground">
            {error ? 'Camera access required' : 'Point your camera at the QR code'}
          </p>
          <div className="flex w-full items-center gap-2">
            {error && (
              <Button type="button" variant="outline" className="flex-1" onClick={handleRetry}>
                Retry
              </Button>
            )}
            <Button type="button" variant={error ? "default" : "outline"} className="flex-1" onClick={handleCancel}>
              {error ? 'Close' : 'Cancel'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ===== CLINIC ID ENTRY =====
function ClinicIdEntry() {
  const router = useRouter();
  const [clinicId, setClinicId] = useState('');

  const goToJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = clinicId.trim();
    if (!trimmed) return;
    router.push(`/join?clinicId=${encodeURIComponent(trimmed)}`);
  };

  return (
    <form onSubmit={goToJoin} className="flex w-full max-w-xs items-center gap-2">
      <Input
        type="text"
        placeholder="Enter clinic ID"
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
        disabled={!clinicId.trim()}
      >
        Go
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
  const [scanning, setScanning] = useState(false);
  const router = useRouter();
  
  function extractClinicId(text: string): string | null {
    const raw = (text || '').trim();
    if (!raw) return null;
    // If it's a URL, try to extract clinicId from query
    try {
      const url = new URL(raw);
      const fromQuery = url.searchParams.get('clinicId') || url.searchParams.get('c');
      if (fromQuery && /^[a-z0-9-]+$/i.test(fromQuery)) return fromQuery;
      // If path-based pattern ever used: /join?clinicId=... already handled; otherwise ignore
    } catch {
      // Not a valid URL - could be a raw clinic id
    }
    // Fallback: if the scanned content looks like a clinic id, accept it
    const m = raw.match(/^[a-z0-9-]{3,}$/i);
    if (m) return raw;
    // Last resort: attempt to parse query portion if it's something like clinicId=...
    try {
      const qIndex = raw.indexOf('?');
      const qs = new URLSearchParams(qIndex >= 0 ? raw.slice(qIndex + 1) : raw);
      const fromQs = qs.get('clinicId') || qs.get('c');
      if (fromQs && /^[a-z0-9-]+$/i.test(fromQs)) return fromQs;
  } catch {}
    return null;
  }

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
            onClick={() => setScanning(true)}
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
            Scan QR Code
          </Button>
          <ClinicIdEntry />
        </div>
      </div>
      {scanning && (
        <QRCodeScanner
          onScan={(text) => {
            setScanning(false);
            const cid = extractClinicId(text);
            if (cid) {
              router.push(`/join?clinicId=${encodeURIComponent(cid)}`);
            } else {
              // If it's a full URL to our join page, navigate directly as a fallback
              try {
                const u = new URL(text);
                if (/\/join(\?|$)/.test(u.pathname)) {
                  // Stay within app routing if same origin
                  if (typeof window !== 'undefined' && u.origin === window.location.origin) {
                    router.push(u.pathname + (u.search || ''));
                  } else {
                    window.location.href = u.toString();
                  }
                  return;
                }
              } catch {}
              console.warn('QR scan did not contain a recognizable clinic link or ID');
            }
          }}
          onCancel={() => setScanning(false)}
          onError={(err) => {
            console.error('QR scan error:', err);
            setScanning(false);
          }}
        />
      )}
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
      title: 'Scan or Enter ID',
      description: 'Join the queue instantly by scanning the clinic\'s QR code or entering their unique ID.'
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
