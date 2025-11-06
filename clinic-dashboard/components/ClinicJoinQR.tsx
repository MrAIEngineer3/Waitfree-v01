"use client";
import { useMemo, useRef } from 'react';
import QRCode from 'react-qr-code';

type Props = {
  clinicId: string;
  clinicSlug?: string | null;
  clinicShareCode?: string | null;
  className?: string;
};

/**
 * Renders a QR code that links patients to the PWA join page.
 * URL shape: `${BASE}/join?code=${shareCode}&clinicId=${clinicId}`
 * Optional doctorId can be supported later if we roll out per-doctor codes.
 */
export default function ClinicJoinQR({ clinicId, clinicSlug, clinicShareCode, className }: Props) {
  // Resolve Patient PWA base URL with safe fallbacks:
  // 1) Explicit env var (recommended for production)
  // 2) Runtime inference from current origin when not on localhost
  // 3) Dev fallback to localhost:3002
  const base = useMemo(() => {
    const envBase = process.env.NEXT_PUBLIC_PATIENT_BASE_URL?.replace(/\/$/, '');
    if (envBase) return envBase;
    if (typeof window !== 'undefined') {
      const { origin, hostname } = window.location;
      const isLocal = /localhost|127\.0\.0\.1/.test(hostname);
      if (!isLocal) {
        // Best-effort inference: if dashboard is on a prod domain and no env is set,
        // use the appropriate origin rather than localhost.
        // Special-case: when the dashboard is served from app.waitfreeclinic.com,
        // patients should land on waitfreeclinic.com (root domain).
        if (/^app\.waitfreeclinic\.com$/i.test(hostname)) {
          return 'https://waitfreeclinic.com';
        }
        // Otherwise use current origin.
        console.warn('[ClinicJoinQR] NEXT_PUBLIC_PATIENT_BASE_URL is not set. Inferring base from current origin:', origin);
        return origin.replace(/\/$/, '');
      }
    }
    // Dev default
    return 'http://localhost:3002';
  }, []);
  const shareCodeParam = useMemo(() => {
    if (!clinicShareCode) return null;
    const compact = clinicShareCode.replace(/\s+/g, '');
    if (!compact) return null;
    return compact.toUpperCase();
  }, [clinicShareCode]);

  const shareCodeDisplay = useMemo(() => {
    if (!shareCodeParam) return null;
    const upper = shareCodeParam;
    if (upper.includes('-')) {
      return upper;
    }
    return upper.match(/.{1,4}/g)?.join(' ') ?? upper;
  }, [shareCodeParam]);

  const url = useMemo(() => {
    const identifier = clinicSlug ?? clinicId;
    const resolved = identifier ?? clinicId;
    const u = new URL(base + '/join');
    if (shareCodeParam) {
      u.searchParams.set('code', shareCodeParam);
    }
    if (resolved) {
      u.searchParams.set('clinicId', resolved);
    }
    // Phase 1: do not include doctorId
    return u.toString();
  }, [base, clinicId, clinicSlug, shareCodeParam]);

  const svgWrapperRef = useRef<HTMLDivElement>(null);

  if (!shareCodeParam) {
    return (
      <div className={className}>
        <div className="rounded-xl border border-border bg-card/70 backdrop-blur-sm shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30">
            <h3 className="text-sm font-semibold text-foreground">Patient Join QR</h3>
            <p className="text-xs text-muted-foreground">Share code is being generated. Please check again in a few seconds.</p>
          </div>
          <div className="p-4 text-sm text-muted-foreground text-center">
            We will show the QR and share code as soon as it is ready.
          </div>
        </div>
      </div>
    );
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // ignore
    }
  };

  const downloadPng = () => {
    try {
      const container = svgWrapperRef.current;
      if (!container) return;
      const svg = container.querySelector('svg');
      if (!svg) return;
      const xml = new XMLSerializer().serializeToString(svg);
      const svg64 = btoa(unescape(encodeURIComponent(xml)));
      const image64 = 'data:image/svg+xml;base64,' + svg64;

      const img = new Image();
      const size = 1024;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, 0, 0, size, size);
        const pngUrl = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = pngUrl;
        a.download = `waitfree-join-${shareCodeParam}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      };
      img.src = image64;
    } catch {
      // ignore
    }
  };

  const printQR = () => {
    const container = svgWrapperRef.current;
    if (!container) return;
    const svg = container.querySelector('svg');
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const svgDataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);

    const w = window.open('', '_blank', 'width=600,height=800');
    if (!w) return;
    const title = 'WaitFree Patient Join QR';
    const metaBlock = `<div class="meta">Clinic Code: ${shareCodeDisplay}</div>`;

    const doc = `<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${title}</title>
          <style>
            body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; padding: 24px; }
            .card { max-width: 640px; margin: 0 auto; text-align: center; }
            .qr { margin: 16px auto; width: 320px; height: 320px; }
            .meta { color: #555; font-size: 14px; }
            .meta--secondary { color: #777; font-size: 12px; margin-top: 4px; }
            .link { word-break: break-all; font-size: 12px; color: #333; }
            @media print { .no-print { display: none; } }
          </style>
        </head>
        <body>
          <div class="card">
            <h1 style="margin:0 0 8px">Scan to Join Queue</h1>
            ${metaBlock}
            <img class="qr" alt="Clinic Join QR" src="${svgDataUrl}" />
            <div class="link">${url}</div>
            <div class="no-print" style="margin-top:16px;color:#777">Use your browser's print dialog to print or save as PDF.</div>
          </div>
          <script>setTimeout(function(){ window.print(); }, 50);</script>
        </body>
      </html>`;
    w.document.open();
    w.document.write(doc);
    w.document.close();
  };

  return (
    <div className={className}>
      <div className="rounded-xl border border-border bg-card/70 backdrop-blur-sm shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30">
          <h3 className="text-sm font-semibold text-foreground">Patient Join QR</h3>
          <p className="text-xs text-muted-foreground">Scan to open Join page. Works with any QR scanner.</p>
        </div>
        <div className="p-4 flex flex-col items-center gap-3">
          <div ref={svgWrapperRef} className="bg-background p-3 rounded-lg border border-border">
            <QRCode value={url} size={192} bgColor="#ffffff" fgColor="#000000" />
          </div>
          <div className="text-[11px] text-muted-foreground break-all text-center max-w-full">
            {url}
          </div>
          <div className="text-xs font-semibold text-foreground text-center">
            Clinic code: <span className="font-mono tracking-widest">{shareCodeDisplay}</span>
          </div>
          <div className="flex gap-2 flex-wrap justify-center">
            <button onClick={copyLink} className="h-8 px-3 text-xs font-medium text-foreground bg-background hover:bg-accent border border-border rounded-lg shadow-sm cursor-pointer">Copy link</button>
            <button onClick={downloadPng} className="h-8 px-3 text-xs font-medium text-foreground bg-background hover:bg-accent border border-border rounded-lg shadow-sm cursor-pointer">Download PNG</button>
            <button onClick={printQR} className="h-8 px-3 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 rounded-lg shadow-sm cursor-pointer">Print</button>
          </div>
          <div className="text-[11px] text-muted-foreground text-center">
            No scanner? Open the patient app and enter the clinic code:
            {' '}
            <span className="font-mono">{shareCodeDisplay}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
