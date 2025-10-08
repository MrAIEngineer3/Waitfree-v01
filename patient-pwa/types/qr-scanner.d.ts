declare module 'qr-scanner' {
  interface ScanResult {
    data: string;
    cornerPoints: Array<{ x: number; y: number }>;
  }

  interface ScanRegion {
    x: number;
    y: number;
    width: number;
    height: number;
  }

  interface QrScannerOptions {
    preferredCamera?: 'environment' | 'user' | string;
    maxScansPerSecond?: number;
    highlightScanRegion?: boolean;
    highlightCodeOutline?: boolean;
    returnDetailedScanResult?: boolean;
    calculateScanRegion?: (video: HTMLVideoElement) => ScanRegion;
  }

  class QrScanner {
    constructor(
      video: HTMLVideoElement,
      onDecode: (result: ScanResult) => void,
      options?: QrScannerOptions
    );

    start(): Promise<void>;
    stop(): void;
    destroy(): void;
    pause(): void;
    setCamera(cameraId: string): Promise<void>;
    turnFlashOn(): Promise<void>;
    turnFlashOff(): Promise<void>;
    toggleFlash(): Promise<void>;
    isFlashOn(): boolean;

    static scanImage(
      imageOrCanvas: HTMLImageElement | HTMLCanvasElement | ImageData | Blob | File,
      options?: { scanRegion?: ScanRegion; qrEngine?: string; canvas?: HTMLCanvasElement }
    ): Promise<ScanResult>;

    static listCameras(updateExisting?: boolean): Promise<Array<{ id: string; label: string }>>;
    static hasCamera(): Promise<boolean>;
  }

  export = QrScanner;
}
