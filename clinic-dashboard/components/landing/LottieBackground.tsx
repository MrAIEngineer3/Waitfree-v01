"use client";

/**
 * Animated Clinic Waiting Room Scene
 * Shows patient journey: entering → sitting → getting queue number
 * Positioned around hero heading for visibility
 */

export default function LottieBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {/* Soft gradient base - only in hero */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-cyan-50/30" />
      
      {/* Subtle ambient orbs */}
      <div className="absolute top-20 left-20 w-[400px] h-[400px] bg-blue-400/8 rounded-full blur-3xl animate-pulse" />
      <div className="absolute top-20 right-20 w-[400px] h-[400px] bg-cyan-400/8 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />

      {/* Main Animated Scene - BESIDE the heading (right side) */}
      <div className="absolute top-[8%] right-[5%] w-[480px] h-[380px] opacity-[0.35] max-md:w-[280px] max-md:h-[220px] max-md:top-[5%] max-md:right-[2%] max-md:opacity-[0.25]">
        <svg width="480" height="380" viewBox="0 0 480 380" fill="none" className="w-full h-full">
          {/* Clinic Room Background */}
          <rect x="20" y="20" width="440" height="240" rx="8" fill="#e0f2fe" opacity="0.7"/>
          <path d="M 20 260 L 20 320 L 460 320 L 460 260 Z" fill="#cbd5e1" opacity="0.5"/>
          
          {/* Reception Desk */}
          <g id="reception-desk">
            <rect x="50" y="140" width="110" height="90" rx="6" fill="#3b82f6" opacity="0.6"/>
            <rect x="55" y="145" width="100" height="60" rx="4" fill="#60a5fa" opacity="0.5"/>
            <rect x="75" y="155" width="40" height="35" rx="3" fill="#1e40af" opacity="0.7">
              <animate attributeName="opacity" values="0.7;0.9;0.7" dur="2s" repeatCount="indefinite"/>
            </rect>
            <rect x="90" y="190" width="8" height="15" fill="#1e40af" opacity="0.6"/>
          </g>

          {/* Queue Display Screen */}
          <g id="queue-screen">
            <rect x="200" y="50" width="100" height="70" rx="6" fill="#1e293b" opacity="0.7"/>
            <rect x="207" y="57" width="86" height="56" rx="3" fill="#0f172a" opacity="0.6"/>
            <text x="250" y="90" textAnchor="middle" fontSize="28" fill="#06b6d4" opacity="0.9" fontWeight="bold">
              A5
              <animate attributeName="opacity" values="0.9;1;0.9" dur="2s" repeatCount="indefinite"/>
            </text>
            <text x="250" y="110" textAnchor="middle" fontSize="10" fill="#60a5fa" opacity="0.7">NOW SERVING</text>
          </g>

          {/* Waiting Chairs */}
          <g id="chairs">
            <rect x="310" y="160" width="55" height="40" rx="4" fill="#3b82f6" opacity="0.6"/>
            <rect x="315" y="164" width="45" height="32" rx="3" fill="#60a5fa" opacity="0.5"/>
            <rect x="310" y="200" width="55" height="25" rx="3" fill="#3b82f6" opacity="0.7"/>
            <rect x="315" y="225" width="6" height="18" rx="3" fill="#1e40af" opacity="0.5"/>
            <rect x="354" y="225" width="6" height="18" rx="3" fill="#1e40af" opacity="0.5"/>
            
            <rect x="380" y="160" width="55" height="40" rx="4" fill="#3b82f6" opacity="0.6"/>
            <rect x="385" y="164" width="45" height="32" rx="3" fill="#60a5fa" opacity="0.5"/>
            <rect x="380" y="200" width="55" height="25" rx="3" fill="#3b82f6" opacity="0.7"/>
            <rect x="385" y="225" width="6" height="18" rx="3" fill="#1e40af" opacity="0.5"/>
            <rect x="424" y="225" width="6" height="18" rx="3" fill="#1e40af" opacity="0.5"/>
          </g>

          {/* Plant */}
          <ellipse cx="440" cy="235" rx="12" ry="18" fill="#10b981" opacity="0.4"/>
          <ellipse cx="435" cy="225" rx="10" ry="15" fill="#059669" opacity="0.5"/>
          <ellipse cx="445" cy="225" rx="10" ry="15" fill="#059669" opacity="0.5"/>

          {/* Patient Walking Animation */}
          <g id="patient-walking">
            <circle cx="0" cy="0" r="14" fill="#93c5fd" opacity="0.8">
              <animateMotion path="M 30 235 L 150 235 L 250 235 L 335 235" dur="8s" repeatCount="indefinite"/>
            </circle>
            <ellipse cx="0" cy="0" rx="16" ry="28" fill="#93c5fd" opacity="0.8">
              <animateMotion path="M 30 260 L 150 260 L 250 260 L 335 260" dur="8s" repeatCount="indefinite"/>
            </ellipse>
            <rect x="-6" y="18" width="5" height="22" rx="2.5" fill="#3b82f6" opacity="0.7">
              <animateMotion path="M 30 260 L 150 260 L 250 260 L 335 260" dur="8s" repeatCount="indefinite"/>
              <animate attributeName="x" values="-6;-4;-6" dur="0.5s" repeatCount="indefinite"/>
            </rect>
            <rect x="1" y="18" width="5" height="22" rx="2.5" fill="#3b82f6" opacity="0.7">
              <animateMotion path="M 30 260 L 150 260 L 250 260 L 335 260" dur="8s" repeatCount="indefinite"/>
              <animate attributeName="x" values="1;3;1" dur="0.5s" repeatCount="indefinite"/>
            </rect>
            <rect x="-18" y="4" width="4" height="18" rx="2" fill="#3b82f6" opacity="0.7">
              <animateMotion path="M 30 260 L 150 260 L 250 260 L 335 260" dur="8s" repeatCount="indefinite"/>
            </rect>
            <rect x="14" y="4" width="4" height="18" rx="2" fill="#3b82f6" opacity="0.7">
              <animateMotion path="M 30 260 L 150 260 L 250 260 L 335 260" dur="8s" repeatCount="indefinite"/>
            </rect>
          </g>

          {/* Patient Sitting */}
          <g id="patient-sitting" opacity="0">
            <circle cx="337" cy="172" r="14" fill="#93c5fd" opacity="0.8"/>
            <ellipse cx="337" cy="195" rx="16" ry="24" fill="#93c5fd" opacity="0.8"/>
            <rect x="330" y="213" width="6" height="22" rx="3" fill="#3b82f6" opacity="0.7"/>
            <rect x="340" y="213" width="6" height="22" rx="3" fill="#3b82f6" opacity="0.7"/>
            <rect x="322" y="188" width="5" height="16" rx="2.5" fill="#3b82f6" opacity="0.7"/>
            <rect x="350" y="188" width="5" height="16" rx="2.5" fill="#3b82f6" opacity="0.7"/>
            <rect x="320" y="198" width="10" height="15" rx="2" fill="#1e40af" opacity="0.8">
              <animate attributeName="opacity" values="0.8;1;0.8" dur="1.5s" repeatCount="indefinite"/>
            </rect>
            <animate attributeName="opacity" values="0;0;0;1;1;1;1;1;0;0;0" dur="8s" repeatCount="indefinite"/>
          </g>

          {/* Notification */}
          <g id="notification" opacity="0">
            <rect x="295" y="130" width="70" height="32" rx="16" fill="#06b6d4" opacity="0.9"/>
            <text x="330" y="152" textAnchor="middle" fontSize="16" fill="white" fontWeight="bold">A5</text>
            <animate attributeName="opacity" values="0;0;0;0;0;1;1;0;0;0;0" dur="8s" repeatCount="indefinite"/>
            <animateTransform attributeName="transform" type="translate" values="0,8; 0,0; 0,-4; 0,0" dur="1.5s" begin="3s" repeatCount="2"/>
          </g>

          {/* Receptionist */}
          <circle cx="105" cy="160" r="12" fill="#fbbf24" opacity="0.7"/>
          <ellipse cx="105" cy="178" rx="14" ry="20" fill="#fbbf24" opacity="0.7"/>

          {/* Clinic Sign */}
          <rect x="120" y="35" width="75" height="38" rx="6" fill="#3b82f6" opacity="0.5"/>
          <text x="157" y="60" textAnchor="middle" fontSize="14" fill="#1e40af" opacity="0.8" fontWeight="bold">CLINIC</text>

          {/* Medical Cross */}
          <rect x="40" y="50" width="16" height="48" rx="3" fill="#ef4444" opacity="0.7">
            <animate attributeName="opacity" values="0.7;0.9;0.7" dur="3s" repeatCount="indefinite"/>
          </rect>
          <rect x="28" y="62" width="40" height="16" rx="3" fill="#ef4444" opacity="0.7">
            <animate attributeName="opacity" values="0.7;0.9;0.7" dur="3s" repeatCount="indefinite"/>
          </rect>
        </svg>
      </div>

      {/* Stethoscope - LEFT */}
      <div className="absolute top-[20%] left-[8%] opacity-[0.25] animate-[float_8s_ease-in-out_infinite] max-md:w-[60px] max-md:h-[60px] max-md:top-[12%] max-md:left-[5%] max-md:opacity-[0.15]">
        <svg width="120" height="120" viewBox="0 0 120 120" className="w-full h-full">
          <circle cx="35" cy="25" r="10" fill="#3b82f6" opacity="0.6"/>
          <circle cx="65" cy="25" r="10" fill="#3b82f6" opacity="0.6"/>
          <path d="M 35 35 Q 35 50 40 65" stroke="#3b82f6" strokeWidth="3" fill="none" opacity="0.7"/>
          <path d="M 65 35 Q 65 50 60 65" stroke="#3b82f6" strokeWidth="3" fill="none" opacity="0.7"/>
          <circle cx="50" cy="70" r="6" fill="#60a5fa" opacity="0.7"/>
          <path d="M 50 76 L 50 90" stroke="#3b82f6" strokeWidth="4" fill="none" opacity="0.7"/>
          <circle cx="50" cy="100" r="12" fill="#1e40af" opacity="0.7">
            <animate attributeName="opacity" values="0.7;0.9;0.7" dur="2s" repeatCount="indefinite"/>
          </circle>
        </svg>
      </div>

      {/* Clipboard - BOTTOM LEFT */}
      <div className="absolute bottom-[15%] left-[10%] opacity-[0.2] animate-[float_9s_ease-in-out_infinite] max-md:w-[50px] max-md:h-[60px] max-md:bottom-[25%] max-md:left-[5%] max-md:opacity-[0.12]" style={{ animationDelay: '-3s' }}>
        <svg width="80" height="100" viewBox="0 0 80 100" className="w-full h-full">
          <rect x="10" y="15" width="60" height="80" rx="4" fill="#3b82f6" opacity="0.7"/>
          <rect x="14" y="19" width="52" height="72" rx="3" fill="white" opacity="0.9"/>
          <rect x="28" y="5" width="24" height="12" rx="6" fill="#1e40af" opacity="0.8"/>
          <rect x="22" y="32" width="36" height="2.5" rx="1.25" fill="#93c5fd" opacity="0.7"/>
          <rect x="22" y="40" width="32" height="2.5" rx="1.25" fill="#93c5fd" opacity="0.7"/>
          <rect x="22" y="48" width="36" height="2.5" rx="1.25" fill="#93c5fd" opacity="0.7"/>
          <path d="M 22 60 L 25 63 L 30 58" stroke="#06b6d4" strokeWidth="2" fill="none" opacity="0.8"/>
          <path d="M 22 70 L 25 73 L 30 68" stroke="#06b6d4" strokeWidth="2" fill="none" opacity="0.8"/>
        </svg>
      </div>

      {/* Medical Cross - TOP RIGHT */}
      <div className="absolute top-[6%] right-[3%] opacity-[0.15] animate-[float_7s_ease-in-out_infinite] max-md:w-[50px] max-md:h-[50px] max-md:top-[3%] max-md:right-[2%] max-md:opacity-[0.1]" style={{ animationDelay: '-2s' }}>
        <svg width="80" height="80" viewBox="0 0 80 80" className="w-full h-full">
          <rect x="28" y="10" width="24" height="60" rx="6" fill="#06b6d4" opacity="0.7"/>
          <rect x="10" y="28" width="60" height="24" rx="6" fill="#06b6d4" opacity="0.7"/>
          <circle cx="40" cy="40" r="10" fill="white" opacity="0.5">
            <animate attributeName="r" values="10;12;10" dur="3s" repeatCount="indefinite"/>
          </circle>
        </svg>
      </div>
    </div>
  );
}
