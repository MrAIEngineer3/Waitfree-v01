"use client";
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import QrScanner from 'qr-scanner';
import { useEffect, useRef, useState } from 'react';

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
      try { if (videoRef.current) (videoRef.current as any).srcObject = null; } catch {}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg p-6 shadow-lg flex flex-col items-center max-w-sm mx-4">
        <div className="relative w-80 h-80 bg-black rounded-lg overflow-hidden">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
          />
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/75 p-4">
              <div className="text-white text-center">
                <div className="text-red-400 mb-2">⚠️</div>
                <div className="text-sm">{error}</div>
              </div>
            </div>
          )}
        </div>
        <div className="mt-4 text-center">
          <p className="text-sm text-gray-600 mb-3">
            {error ? 'Camera access required' : 'Point your camera at the QR code'}
          </p>
          <div className="flex items-center gap-2">
            {error && (
              <button
                type="button"
                onClick={handleRetry}
                className="wf-btn-secondary"
              >
                Retry
              </button>
            )}
            <button
              type="button"
              onClick={handleCancel}
              className="wf-btn-primary"
            >
              {error ? 'Close' : 'Cancel'}
            </button>
          </div>
        </div>
      </div>
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
    <form onSubmit={goToJoin} className="relative w-full sm:w-auto sm:max-w-xs group">
      <input 
        type="text" 
        placeholder="Enter Clinic ID" 
        value={clinicId}
        onChange={(e) => setClinicId(e.target.value)}
        className="w-full h-12 bg-white rounded-full pl-6 pr-16 text-gray-900 placeholder-gray-400 border border-gray-200/80 shadow-sm focus:ring-2 focus:ring-blue-400 focus:outline-none transition-all"
      />
      <button 
        type="submit" 
        disabled={!clinicId.trim()}
        aria-label="Go to clinic" 
        className="absolute h-9 w-9 top-1.5 right-1.5 flex items-center justify-center bg-gray-800 text-white rounded-full hover:bg-gray-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14"/>
          <path d="m12 5 7 7-7 7"/>
        </svg>
      </button>
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
    } catch (_) {
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
    } catch (_) {}
    return null;
  }

  return (
    <section className="pt-1 sm:pt-2 pb-16 sm:pb-20 text-center">
      <div>
        <a href="#" className="inline-flex items-center gap-2 bg-white px-4 py-1.5 rounded-full border border-gray-200/80 shadow-sm text-sm mb-3 hover:shadow-md transition-shadow animate-on-load hero-item-animate" style={{animationDelay: '0.2s'}}>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
          </span>
          Introducing our new Queue Intelligence Platform
        </a>
        <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tighter text-gray-900 leading-tight animate-on-load hero-item-animate" style={{animationDelay: '0.4s'}}>
          The Waiting Room, <br /> <span className="wf-gradient-text">Reimagined.</span>
        </h1>
        <p className="max-w-2xl mx-auto mt-6 text-lg text-gray-600 animate-on-load hero-item-animate" style={{animationDelay: '0.6s'}}>
          Your clinic journey simplified. Discover, book, and track your turn from anywhere. Arrive just-in-time, stress-free.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 animate-on-load hero-item-animate" style={{animationDelay: '0.8s'}}>
          <button 
            type="button" 
            onClick={() => setScanning(true)}
            className="btn-primary text-white font-semibold py-3 px-8 rounded-full shadow-lg w-full sm:w-auto"
          >
            Scan Clinic QR Code
          </button>
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
              } catch (_) {}
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
      <div className="scroll-animation relative w-full max-w-4xl mx-auto h-[400px] sm:h-[600px] flex items-center justify-center">
        {/* Phone Frame */}
        <div className="relative w-72 sm:w-80 h-[580px] sm:h-[620px] bg-gray-800 rounded-[40px] border-[14px] border-gray-800 shadow-2xl shadow-gray-400/30 overflow-hidden">
          {/* Phone Screen Content */}
          <div className="w-full h-full bg-white flex flex-col">
            {/* Header */}
            <div className="p-4 bg-gray-50 border-b border-gray-200">
              <p className="text-xs font-semibold tracking-wider text-blue-600">LIVE QUEUE</p>
              <h3 className="text-lg font-semibold text-gray-900">City General Hospital</h3>
            </div>
            {/* Queue Info */}
            <div className="flex-grow p-6 flex flex-col justify-center items-center text-center space-y-4">
              <p className="text-sm text-gray-500">Your Turn</p>
              <div className="text-7xl font-bold wf-gradient-text">24</div>
              <p className="text-sm text-gray-500">Est. Wait: <span className="font-bold text-gray-800">15 mins</span></p>
            </div>
            {/* Current Patient */}
            <div className="p-4 m-4 bg-blue-50 rounded-xl border border-blue-200 text-center">
              <p className="text-sm font-medium text-blue-800">Now Serving</p>
              <p className="text-2xl font-bold text-blue-900">21</p>
            </div>
          </div>
        </div>

        {/* Floating Cards - Hidden on mobile to prevent overlap */}
        <div className="hidden md:block absolute -top-10 -left-4 sm:-left-20 w-40 sm:w-56 glass-card p-4 rounded-2xl shadow-lg transition-transform hover:scale-105">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
              </svg>
            </div>
            <div>
              <p className="font-semibold text-sm">Checked In!</p>
              <p className="text-xs text-gray-500">You're in the queue.</p>
            </div>
          </div>
        </div>
        <div className="hidden md:block absolute top-1/3 -right-4 sm:-right-24 w-40 sm:w-56 glass-card p-4 rounded-2xl shadow-lg transition-transform hover:scale-105">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-cyan-100 rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path>
              </svg>
            </div>
            <div>
              <p className="font-semibold text-sm">It's almost time!</p>
              <p className="text-xs text-gray-500">Please head to the clinic.</p>
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
      description: 'Receive timely alerts when it\'s almost your turn, so you can arrive just-in-time.'
    }
  ];

  return (
    <section id="features" className="py-16 sm:py-20">
      <div className="text-center mb-16 scroll-animation">
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900">A smarter way to wait.</h2>
        <p className="max-w-xl mx-auto mt-4 text-gray-600">Waitfree empowers you with features that put you in control.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
        {features.map((feature, index) => (
          <div 
            key={feature.title}
            className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 scroll-animation feature-card"
            style={{transitionDelay: `${index * 100}ms`}}
          >
            <div className="w-12 h-12 mb-5 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600">
              {feature.icon}
            </div>
            <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
            <p className="text-gray-600 text-sm">{feature.description}</p>
          </div>
        ))}
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
      <div className="text-center mb-16 scroll-animation">
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900">Get started in 3 easy steps.</h2>
        <p className="max-w-xl mx-auto mt-4 text-gray-600">Your journey to a stress-free clinic visit is simple.</p>
      </div>
      <div className="relative">
        {/* Dotted Line for Desktop */}
        <div className="hidden lg:block absolute top-1/2 left-0 w-full h-0.5 border-t-2 border-dashed border-gray-300 -translate-y-1/2"></div>
        
        <div className="relative grid grid-cols-1 md:grid-cols-3 gap-12 lg:gap-8">
          {steps.map((step, index) => (
            <div 
              key={step.number}
              className="text-center scroll-animation"
              style={{transitionDelay: `${index * 150}ms`}}
            >
              <div className="relative inline-block">
                <div className="w-20 h-20 mx-auto mb-6 flex items-center justify-center bg-white rounded-full text-2xl font-bold wf-gradient-text border-2 border-gray-200 shadow-md">
                  {step.number}
                </div>
              </div>
              <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
              <p className="text-gray-600 text-sm">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ===== CTA SECTION =====
function CtaSection() {
  return (
    <section className="py-16 sm:py-20">
      <div className="relative rounded-3xl overflow-hidden scroll-animation">
        <div className="absolute inset-0 bg-gray-800"></div>
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 via-cyan-500/20 to-transparent opacity-50"></div>
        <div className="relative text-center p-12 sm:p-20">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">Join the Future of Clinic Visits</h2>
          <p className="max-w-2xl mx-auto mt-4 text-gray-300">Experience calmer, smarter, patient-centric waiting. No guesswork, no crowding—just timely care.</p>
          <Link href="/join" className="mt-8 inline-block btn-primary text-white font-semibold py-3 px-8 rounded-full shadow-lg">
            Get Started for Free
          </Link>
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
