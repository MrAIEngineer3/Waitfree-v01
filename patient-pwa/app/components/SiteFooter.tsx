import Logo from '../../components/Logo';

export default function SiteFooter() {
  const links = [
    { label:'FAQ', href:'/faq' },
    { label:'Privacy Policy', href:'/privacy' },
    { label:'Terms of Service', href:'/terms' },
    { label:'Contact', href:'/contact' },
  ];
  return (
    <footer className="mt-24 border-t border-white/50 bg-white/70 backdrop-blur-xl">
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
            {links.map(l => <a key={l.label} href={l.href} className="hover:text-gray-900 transition-colors">{l.label}</a>)}
          </nav>
        </div>
        <div className="flex flex-col-reverse items-center justify-between gap-4 border-t border-gray-200/70 pt-6 text-[11px] text-gray-500 md:flex-row">
          <p>&copy; {new Date().getFullYear()} Waitfree Health Technologies Pvt. Ltd. | All Rights Reserved</p>
          <p className="flex items-center gap-2 font-medium"><span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>Realtime</p>
        </div>
      </div>
    </footer>
  );
}
