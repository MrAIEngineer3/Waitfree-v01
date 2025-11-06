"use client";

/**
 * Enhanced Morphing Background with Healthcare Theme
 * Zero dependencies - Pure CSS animations
 * Optimized for landing page hero sections
 */

export default function MorphingBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden="true">
      {/* Base gradient mesh - larger and more vibrant */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-cyan-50/50 to-purple-50/30" />
      
      {/* Large morphing orbs with better positioning */}
      <div className="absolute -top-40 -left-40 w-[800px] h-[800px] bg-gradient-to-br from-blue-400/30 via-cyan-400/20 to-transparent rounded-full blur-3xl animate-[morph_20s_ease-in-out_infinite]" />
      <div className="absolute top-1/4 -right-40 w-[900px] h-[900px] bg-gradient-to-bl from-purple-400/25 via-blue-400/20 to-transparent rounded-full blur-3xl animate-[morph_25s_ease-in-out_infinite]" style={{ animationDelay: '-5s' }} />
      <div className="absolute top-2/3 left-1/4 w-[700px] h-[700px] bg-gradient-to-tr from-cyan-400/30 via-blue-300/20 to-transparent rounded-full blur-3xl animate-[morph_30s_ease-in-out_infinite]" style={{ animationDelay: '-10s' }} />
      
      {/* Additional accent orbs for depth */}
      <div className="absolute top-1/2 left-1/3 w-96 h-96 bg-gradient-to-br from-blue-300/20 to-transparent rounded-full blur-2xl animate-[morph_18s_ease-in-out_infinite]" style={{ animationDelay: '-7s' }} />
      <div className="absolute top-1/3 right-1/4 w-[500px] h-[500px] bg-gradient-to-tl from-purple-300/15 to-transparent rounded-full blur-2xl animate-[morph_22s_ease-in-out_infinite]" style={{ animationDelay: '-12s' }} />

      {/* Floating connection lines - representing connected care */}
      <svg className="absolute inset-0 w-full h-full opacity-20" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="line-gradient-1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgb(59, 130, 246)" stopOpacity="0.6">
              <animate attributeName="stop-opacity" values="0.6;0.2;0.6" dur="4s" repeatCount="indefinite" />
            </stop>
            <stop offset="100%" stopColor="rgb(56, 189, 248)" stopOpacity="0.2">
              <animate attributeName="stop-opacity" values="0.2;0.6;0.2" dur="4s" repeatCount="indefinite" />
            </stop>
          </linearGradient>
          <linearGradient id="line-gradient-2" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgb(147, 51, 234)" stopOpacity="0.5">
              <animate attributeName="stop-opacity" values="0.5;0.2;0.5" dur="5s" repeatCount="indefinite" />
            </stop>
            <stop offset="100%" stopColor="rgb(59, 130, 246)" stopOpacity="0.2">
              <animate attributeName="stop-opacity" values="0.2;0.5;0.2" dur="5s" repeatCount="indefinite" />
            </stop>
          </linearGradient>
        </defs>
        
        <path d="M 100 200 Q 300 100 500 200 T 900 200" stroke="url(#line-gradient-1)" strokeWidth="2" fill="none">
          <animate attributeName="d" 
            values="M 100 200 Q 300 100 500 200 T 900 200;
                    M 100 250 Q 300 150 500 220 T 900 250;
                    M 100 200 Q 300 100 500 200 T 900 200"
            dur="8s" repeatCount="indefinite" />
        </path>
        
        <path d="M 200 400 Q 500 300 800 400" stroke="url(#line-gradient-2)" strokeWidth="2" fill="none">
          <animate attributeName="d" 
            values="M 200 400 Q 500 300 800 400;
                    M 200 420 Q 500 340 800 420;
                    M 200 400 Q 500 300 800 400"
            dur="10s" repeatCount="indefinite" />
        </path>
      </svg>

      {/* Floating medical/queue icons with enhanced animations */}
      <div className="absolute top-[20%] left-[12%] w-20 h-20 opacity-10 animate-[float_6s_ease-in-out_infinite]">
        <svg viewBox="0 0 24 24" fill="none" className="w-full h-full text-blue-500 drop-shadow-lg">
          <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="2"/>
          <path d="M9 11l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <animate attributeName="opacity" values="0.1;0.3;0.1" dur="3s" repeatCount="indefinite" />
        </svg>
      </div>

      <div className="absolute top-[30%] right-[15%] w-24 h-24 opacity-8 animate-[float_8s_ease-in-out_infinite]" style={{ animationDelay: '-2s' }}>
        <svg viewBox="0 0 24 24" fill="none" className="w-full h-full text-cyan-500 drop-shadow-lg">
          <path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          <animate attributeName="opacity" values="0.08;0.25;0.08" dur="4s" repeatCount="indefinite" />
        </svg>
      </div>

      <div className="absolute top-[12%] right-[30%] w-16 h-16 opacity-12 animate-[float_7s_ease-in-out_infinite]" style={{ animationDelay: '-4s' }}>
        <svg viewBox="0 0 24 24" fill="none" className="w-full h-full text-purple-500 drop-shadow-lg">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2"/>
          <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          <animate attributeName="opacity" values="0.12;0.3;0.12" dur="3.5s" repeatCount="indefinite" />
        </svg>
      </div>

      <div className="absolute top-[40%] left-[8%] w-18 h-18 opacity-10 animate-[float_9s_ease-in-out_infinite]" style={{ animationDelay: '-6s' }}>
        <svg viewBox="0 0 24 24" fill="none" className="w-full h-full text-blue-400 drop-shadow-lg">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <animate attributeName="opacity" values="0.1;0.28;0.1" dur="4.5s" repeatCount="indefinite" />
        </svg>
      </div>

      {/* Queue visualization - animated token display */}
      <div className="absolute top-[35%] left-[20%] flex items-center gap-3 opacity-6">
        <div className="relative">
          <div className="text-7xl font-bold bg-gradient-to-br from-blue-500 to-cyan-500 bg-clip-text text-transparent animate-[float_10s_ease-in-out_infinite]" style={{ animationDelay: '-1s' }}>
            A5
          </div>
          <div className="absolute inset-0 blur-xl bg-blue-500/30 animate-pulse" />
        </div>
        <svg viewBox="0 0 24 24" className="w-10 h-10 text-blue-400/40 animate-[float_8s_ease-in-out_infinite]" style={{ animationDelay: '-1.5s' }}>
          <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        </svg>
      </div>

      <div className="absolute top-[18%] right-[18%] flex items-center gap-2 opacity-5">
        <div className="relative">
          <div className="text-5xl font-bold bg-gradient-to-br from-purple-500 to-blue-500 bg-clip-text text-transparent animate-[float_12s_ease-in-out_infinite]" style={{ animationDelay: '-6s' }}>
            B12
          </div>
          <div className="absolute inset-0 blur-lg bg-purple-500/20 animate-pulse" style={{ animationDelay: '1s' }} />
        </div>
      </div>

      <div className="absolute bottom-[25%] right-[25%] opacity-4">
        <div className="text-6xl font-bold bg-gradient-to-br from-cyan-500 to-blue-500 bg-clip-text text-transparent animate-[float_11s_ease-in-out_infinite]" style={{ animationDelay: '-8s' }}>
          C8
        </div>
      </div>

      {/* Subtle particle dots */}
      <div className="absolute top-[25%] left-[40%] w-2 h-2 bg-blue-400/40 rounded-full animate-[float_5s_ease-in-out_infinite]" />
      <div className="absolute top-[45%] right-[35%] w-3 h-3 bg-cyan-400/30 rounded-full animate-[float_7s_ease-in-out_infinite]" style={{ animationDelay: '-3s' }} />
      <div className="absolute top-[15%] left-[60%] w-2 h-2 bg-purple-400/40 rounded-full animate-[float_6s_ease-in-out_infinite]" style={{ animationDelay: '-5s' }} />
      <div className="absolute bottom-[30%] left-[45%] w-2 h-2 bg-blue-300/30 rounded-full animate-[float_8s_ease-in-out_infinite]" style={{ animationDelay: '-2s' }} />

      {/* Animated grid overlay - more subtle */}
      <div 
        className="absolute inset-0 opacity-[0.015]"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgb(59 130 246) 1px, transparent 1px),
            linear-gradient(to bottom, rgb(59 130 246) 1px, transparent 1px)
          `,
          backgroundSize: '80px 80px',
          animation: 'gridMove 25s linear infinite'
        }}
      />
    </div>
  );
}
