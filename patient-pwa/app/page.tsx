import Link from 'next/link';
import ClinicIdEntry from './components/ClinicIdEntry';

export default function LandingPage() {
  const features = [
    { title: 'Scan QR', desc: 'Open the queue instantly at the clinic entrance.', icon: '📷' },
    { title: 'Track Progress', desc: 'Real-time visibility of movement and ETA.', icon: '📊' },
    { title: 'Stay Notified', desc: 'Know when you are getting close—no crowding.', icon: '🔔' },
    { title: 'Reduce Stress', desc: 'Sit comfortably instead of guarding a line.', icon: '😌' },
    { title: 'Transparent Flow', desc: 'See exactly how many are ahead of you.', icon: '🔍' },
    { title: 'Modern Experience', desc: 'An intuitive, digital-first waiting journey.', icon: '✨' },
  ];
  return (
    <div className="space-y-20">
      {/* Hero */}
      <section className="text-center space-y-8 pt-4 sm:pt-0">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-medium bg-white/60 backdrop-blur border border-white/50 shadow-sm text-gray-700">
          <span className="h-2 w-2 rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 animate-pulse" /> Live Queue Intelligence
        </div>
        <h1 className="wf-animated-gradient font-bold tracking-tight text-4xl sm:text-5xl md:text-[3.6rem] leading-[1.1]">
          Smart Digital Clinic Queues
        </h1>
        <p className="text-base sm:text-lg md:text-xl leading-relaxed text-gray-600 max-w-2xl mx-auto">
          A calm, transparent waiting experience—instantly know your place, progress, and when you are almost up.
        </p>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-center gap-4 pt-2">
          <Link href="/join" className="wf-glow relative inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-cyan-500 shadow-lg shadow-blue-600/20 hover:shadow-blue-600/30 transition-shadow">
            Join a Queue
          </Link>
          <ClinicIdEntry />
        </div>
        <div className="mx-auto max-w-xl pt-4">
          <div className="wf-divider" />
        </div>
      </section>
      {/* Features Grid */}
      <section className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {features.map(card => (
          <div key={card.title} className="wf-card p-5 group hover:shadow-md transition-all duration-200">
            <div className="flex items-start gap-3">
              <span className="text-xl leading-none select-none wf-float" aria-hidden>{card.icon}</span>
              <div className="space-y-1">
                <h3 className="font-semibold text-gray-900 text-sm tracking-wide group-hover:text-gray-950 transition-colors flex items-center gap-1">
                  {card.title}
                </h3>
                <p className="text-xs text-gray-600 leading-relaxed">
                  {card.desc}
                </p>
              </div>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

 
