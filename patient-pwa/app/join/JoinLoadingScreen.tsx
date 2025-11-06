"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

type JoinLoadingScreenProps = {
  shareCode?: string | null;
  clinicId?: string | null;
  className?: string;
};

const backgroundBlurs = [
  'absolute -top-32 -left-24 h-72 w-72 rounded-full bg-cyan-200/40 blur-3xl',
  'absolute top-1/3 -right-28 h-80 w-80 rounded-full bg-blue-200/40 blur-3xl',
  'absolute bottom-[-5rem] left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-sky-100/50 blur-3xl',
];

export function JoinLoadingScreen({ shareCode, clinicId, className }: JoinLoadingScreenProps) {
  const formattedShare = shareCode ?? null;
  const friendlyClinic = clinicId ?? null;

  return (
    <div className={cn('relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-sky-50 via-white to-indigo-50 px-4 py-10 text-foreground', className)}>
      <span aria-live="assertive" className="sr-only">
        Loading the clinic queue experience. This usually takes just a moment.
      </span>
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {backgroundBlurs.map((className, index) => (
          <div key={index} className={cn(className, 'animate-[pulse_6s_ease-in-out_infinite]')} />
        ))}
      </div>
      <Card className="relative z-10 w-full max-w-md border-border/50 bg-white/90 backdrop-blur-xl shadow-2xl shadow-sky-500/20">
        <CardHeader className="space-y-2 text-center">
          <CardTitle className="text-2xl font-semibold tracking-tight text-slate-900">
            Setting up your visit
          </CardTitle>
          <CardDescription className="text-sm text-slate-600">
            We&apos;re verifying the clinic details and fetching live availability.
          </CardDescription>
        </CardHeader>
        <Separator className="mx-auto w-16 bg-sky-200" />
        <CardContent className="space-y-6 pt-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-sky-200 bg-sky-50">
            <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-sky-500 border-t-transparent" />
          </div>
          <div className="space-y-1">
            <p className="text-base font-medium text-slate-900">Matching you with the right doctor</p>
            <p className="text-sm text-slate-600">
              This takes just a few seconds. We&apos;ll bring up the join form as soon as it&apos;s ready.
            </p>
          </div>
          {(formattedShare || friendlyClinic) && (
            <div className="rounded-xl border border-sky-200/70 bg-sky-50/60 px-4 py-3 text-left text-sm text-slate-700">
              {formattedShare ? (
                <p>
                  <span className="font-semibold text-slate-900">Clinic code:</span>{' '}
                  <span className="font-mono tracking-wide text-slate-800">{formattedShare}</span>
                </p>
              ) : null}
              {friendlyClinic ? (
                <p className="mt-1">
                  <span className="font-semibold text-slate-900">Clinic ID:</span>{' '}
                  <span className="font-mono tracking-wide text-slate-800">{friendlyClinic}</span>
                </p>
              ) : null}
            </div>
          )}
          <p className="text-xs text-slate-500">
            Tip: keep this page open. We&apos;ll hand you straight to the queue when we find the next available slot.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default JoinLoadingScreen;
