interface Testimonial { id:number; quote:string; name:string; role:string; avatar?:string; }
export default function TestimonialsSection() {
  const testimonials: Testimonial[] = [
    { id:1, quote:'An anxiety-free wait – the app just works.', name:'Patient A', role:'User'},
    { id:2, quote:'We saw calmer patients & smoother flow.', name:'Clinic Admin', role:'Partner'},
    { id:3, quote:'Timely alerts let me grab coffee nearby.', name:'Patient B', role:'User'},
  ];
  return (
    <section className="space-y-10">
      <h2 className="text-center text-sm font-semibold tracking-wider text-gray-700">Testimonials</h2>
      <div className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl border border-gray-200/70 bg-gradient-to-r from-blue-50 via-cyan-50 to-blue-50 p-8 shadow-inner">
        <div className="grid gap-6 md:grid-cols-3">
          {testimonials.map(t => (
            <figure key={t.id} className="relative flex flex-col gap-4 rounded-2xl border border-white/80 bg-white/80 p-5 shadow-sm backdrop-blur">
              <blockquote className="text-sm leading-relaxed text-gray-700">“{t.quote}”</blockquote>
              <figcaption className="flex items-center gap-3">
                <div className="h-10 w-10 flex items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-cyan-500 text-[11px] font-bold text-white ring-2 ring-white shadow" aria-hidden>{t.name[0]}</div>
                <div className="text-[11px] font-medium tracking-wide text-gray-600">
                  <p className="text-gray-900 font-semibold text-xs">{t.name}</p>
                  <p>{t.role}</p>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
