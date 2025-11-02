import { ReactQueryProvider } from "@/lib/react-query";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import ConditionalShell from "./components/ConditionalShell";
import { JoinScannerProvider } from "./components/JoinScannerProvider";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Waitfree - Patient Portal",
  description: "Join virtual queues and manage your appointments",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover'
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full overflow-x-hidden">
      <body className={`${inter.variable} antialiased min-h-full overflow-x-hidden [text-size-adjust:100%]`}>
        <ReactQueryProvider>
          <JoinScannerProvider>
            <ConditionalShell>{children}</ConditionalShell>
          </JoinScannerProvider>
          <Toaster richColors position="top-center" closeButton />
        </ReactQueryProvider>
      </body>
    </html>
  );
}
