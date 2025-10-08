import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Waitfree - Clinic Dashboard",
  description: "Queue management system for healthcare providers",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // AppShell is now applied only within specific route groups (e.g., (dashboard)).
  return (
    <html lang="en">
      <body className={`${inter.variable} antialiased min-h-screen bg-sem-app text-gray-900`}>{children}</body>
    </html>
  );
}
