import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Join Queue - Waitfree",
  description: "Join virtual queue for your clinic appointment",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover'
};

export default function JoinLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
