"use client";

import { createContext, useCallback, useContext, useMemo, useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import QrScanner from "qr-scanner";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface JoinScannerContextValue {
  openScanner: () => void;
  closeScanner: () => void;
  isOpen: boolean;
}

const JoinScannerContext = createContext<JoinScannerContextValue | null>(null);

function extractClinicId(rawText: string): string | null {
  const raw = rawText.trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    const fromQuery = url.searchParams.get("clinicId") ?? url.searchParams.get("c");
    if (fromQuery && /^[a-z0-9-]+$/i.test(fromQuery)) {
      return fromQuery;
    }
  } catch {
    // Not a URL; fall through to other parsing strategies
  }

  if (/^[a-z0-9-]{3,}$/i.test(raw)) {
    return raw;
  }

  try {
    const queryIndex = raw.indexOf("?");
    const params = new URLSearchParams(queryIndex >= 0 ? raw.slice(queryIndex + 1) : raw);
    const fromParams = params.get("clinicId") ?? params.get("c");
    if (fromParams && /^[a-z0-9-]+$/i.test(fromParams)) {
      return fromParams;
    }
  } catch {
    // Ignore parsing errors and fall through to returning null
  }

  return null;
}

interface QRScannerOverlayProps {
  onScan: (text: string) => void;
  onCancel: () => void;
  onError: (error: Error) => void;
}

function QRScannerOverlay({ onScan, onCancel, onError }: QRScannerOverlayProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const qrScannerRef = useRef<QrScanner | null>(null);
  const mountedRef = useRef(true);
  const startingRef = useRef(false);
  const onScanRef = useRef(onScan);
  const onErrorRef = useRef(onError);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    mountedRef.current = true;
    let scanner: QrScanner | null = null;
    const initialVideo = videoRef.current;

    const initialise = async () => {
      if (!videoRef.current || !mountedRef.current || startingRef.current) {
        return;
      }

      startingRef.current = true;
      setErrorMessage(null);
      try {
        const hasCamera = await QrScanner.hasCamera();
        if (!hasCamera) {
          throw new Error("No camera found on this device");
        }

        await new Promise((resolve) => setTimeout(resolve, 80));
        if (!videoRef.current || !mountedRef.current) {
          return;
        }

        scanner = new QrScanner(
          videoRef.current,
          (result) => {
            try {
              scanner?.stop();
              scanner?.destroy();
            } catch {}
            qrScannerRef.current = null;
            try {
              onScanRef.current(result.data);
            } catch (handlerError) {
              console.error("Scanner onScan handler failed", handlerError);
            }
          },
          {
            preferredCamera: "environment",
            highlightScanRegion: true,
            highlightCodeOutline: true,
            returnDetailedScanResult: true,
            calculateScanRegion: (video) => {
              const smallerDimension = Math.min(video.videoWidth, video.videoHeight);
              const regionSize = Math.round(smallerDimension * 0.7);
              const offsetX = Math.round((video.videoWidth - regionSize) / 2);
              const offsetY = Math.round((video.videoHeight - regionSize) / 2);
              return {
                x: offsetX,
                y: offsetY,
                width: regionSize,
                height: regionSize,
              };
            },
          }
        );

        if (!mountedRef.current) {
          try {
            scanner.destroy();
          } catch {}
          startingRef.current = false;
          return;
        }

        qrScannerRef.current = scanner;
        await scanner.start();
        if (mountedRef.current) {
          setIsLoading(false);
        }
      } catch (error) {
        console.error("Failed to initialise QR scanner", error);
        if (mountedRef.current) {
          setIsLoading(false);
          const message = error instanceof Error ? error.message : "Failed to access camera";
          setErrorMessage(message);
          try {
            onErrorRef.current(error as Error);
          } catch {}
        }
      } finally {
        startingRef.current = false;
      }
    };

    initialise();

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
      if (initialVideo) {
        try {
          initialVideo.srcObject = null;
        } catch {}
      }
    };
  }, []);

  const handleCancel = useCallback(() => {
    mountedRef.current = false;
    try {
      qrScannerRef.current?.destroy();
    } catch {}
    qrScannerRef.current = null;
    onCancel();
  }, [onCancel]);

  const handleRetry = useCallback(() => {
    setIsLoading(true);
    setErrorMessage(null);
    mountedRef.current = true;
    if (!qrScannerRef.current && videoRef.current && !startingRef.current) {
      (async () => {
        try {
          startingRef.current = true;
          const hasCamera = await QrScanner.hasCamera();
          if (!hasCamera) {
            throw new Error("No camera found on this device");
          }
          await new Promise((resolve) => setTimeout(resolve, 80));
          if (!videoRef.current) {
            return;
          }
          const scanner = new QrScanner(
            videoRef.current,
            (result) => {
              try {
                scanner.stop();
                scanner.destroy();
              } catch {}
              qrScannerRef.current = null;
              try {
                onScanRef.current(result.data);
              } catch (handlerError) {
                console.error("Scanner retry handler failed", handlerError);
              }
            },
            {
              preferredCamera: "environment",
              highlightScanRegion: true,
              highlightCodeOutline: true,
              returnDetailedScanResult: true,
              calculateScanRegion: (video) => {
                const smallerDimension = Math.min(video.videoWidth, video.videoHeight);
                const regionSize = Math.round(smallerDimension * 0.7);
                const offsetX = Math.round((video.videoWidth - regionSize) / 2);
                const offsetY = Math.round((video.videoHeight - regionSize) / 2);
                return {
                  x: offsetX,
                  y: offsetY,
                  width: regionSize,
                  height: regionSize,
                };
              },
            }
          );
          qrScannerRef.current = scanner;
          await scanner.start();
          setIsLoading(false);
        } catch (error) {
          console.error("Retry failed to initialise scanner", error);
          setIsLoading(false);
          const message = error instanceof Error ? error.message : "Failed to access camera";
          setErrorMessage(message);
          try {
            onErrorRef.current(error as Error);
          } catch {}
        } finally {
          startingRef.current = false;
        }
      })();
    }
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-md">
      <Card className="w-full max-w-sm border-border/50 bg-card/95 backdrop-blur-sm shadow-2xl">
        <CardContent className="flex flex-col items-center gap-4 p-6">
          <div className="relative h-72 w-72 overflow-hidden rounded-2xl border-2 border-border/40 bg-black shadow-lg">
            <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm">
                <div className="h-10 w-10 animate-spin rounded-full border-3 border-primary border-t-transparent" />
              </div>
            )}
            {errorMessage && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
                <div className="space-y-2 text-center text-sm text-destructive">
                  <div className="text-2xl">⚠️</div>
                  <p className="font-medium">{errorMessage}</p>
                </div>
              </div>
            )}
          </div>
          <p className="text-center text-sm font-medium text-muted-foreground">
            {errorMessage ? "Camera access required" : "Point your camera at the clinic QR code"}
          </p>
          <div className="flex w-full items-center gap-2">
            {errorMessage && (
              <Button type="button" variant="outline" className="flex-1" onClick={handleRetry}>
                Retry
              </Button>
            )}
            <Button
              type="button"
              variant={errorMessage ? "default" : "outline"}
              className="flex-1"
              onClick={handleCancel}
            >
              {errorMessage ? "Close" : "Cancel"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function JoinScannerProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  const closeScanner = useCallback(() => setIsOpen(false), []);

  const handleScan = useCallback(
    (text: string) => {
      closeScanner();
      const clinicId = extractClinicId(text);
      if (clinicId) {
        router.push(`/join?clinicId=${encodeURIComponent(clinicId)}`);
        return;
      }

      try {
        const url = new URL(text);
        if (/\/join(\?|$)/.test(url.pathname)) {
          if (typeof window !== "undefined" && url.origin === window.location.origin) {
            router.push(url.pathname + (url.search || ""));
          } else {
            window.location.href = url.toString();
          }
          return;
        }
      } catch {
        // Ignore URL parsing failure and show fallback toast below
      }

      toast.error("We couldn't read the clinic information from that QR code. Please try again.");
    },
    [closeScanner, router]
  );

  const handleError = useCallback(
    (error: Error) => {
      console.error("QR scan error", error);
      toast.error(error.message || "Unable to access your camera. Check permissions and try again.");
      closeScanner();
    },
    [closeScanner]
  );

  const value = useMemo<JoinScannerContextValue>(
    () => ({
      openScanner: () => setIsOpen(true),
      closeScanner,
      isOpen,
    }),
    [closeScanner, isOpen]
  );

  return (
    <JoinScannerContext.Provider value={value}>
      {children}
      {isOpen && (
        <QRScannerOverlay onScan={handleScan} onCancel={closeScanner} onError={handleError} />
      )}
    </JoinScannerContext.Provider>
  );
}

export function useJoinScanner() {
  const context = useContext(JoinScannerContext);
  if (!context) {
    throw new Error("useJoinScanner must be used within JoinScannerProvider");
  }
  return context;
}
