import Logo from '../../components/Logo';

export default function SiteFooter() {
  const links = [
    { label:'About Us', href:'#' },
    { label:'Privacy Policy', href:'#' },
    { label:'Terms of Service', href:'#' },
    { label:'Contact', href:'#' },
  ];
  return (
    <footer className="mt-24 border-t border-white/50 bg-white/70 backdrop-blur-xl">
      <div className="mx-auto max-w-6xl px-6 py-12 space-y-10">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="space-y-4 max-w-sm">
            <Logo className="text-gray-900" />
            <p className="text-xs leading-relaxed text-gray-600">Building a calmer healthcare access experience – transparent, efficient & human.</p>
          </div>
          <nav className="flex flex-wrap gap-x-10 gap-y-4 text-[11px] font-medium tracking-wide text-gray-600">
            {links.map(l => <a key={l.label} href={l.href} className="hover:text-gray-900 transition-colors">{l.label}</a>)}
          </nav>
        </div>
        <div className="flex flex-col-reverse items-center justify-between gap-4 border-t border-gray-200/70 pt-6 text-[11px] text-gray-500 md:flex-row">
          <p>&copy; {new Date().getFullYear()} Waitfree. All rights reserved.</p>
          <p className="flex items-center gap-2 font-medium"><span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>Realtime</p>
        </div>
      </div>
    </footer>
  );
}
