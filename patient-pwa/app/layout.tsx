import type { Metadata } from "next";
import { Inter } from "next/font/google";
import PatientShell from "./components/PatientShell";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Waitfree - Patient Portal",
  description: "Join virtual queues and manage your appointments",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className={`${inter.variable} antialiased min-h-full`}>        
        <PatientShell>{children}</PatientShell>
      </body>
    </html>
  );
}
