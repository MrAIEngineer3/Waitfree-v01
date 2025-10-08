"use client";

import { usePathname } from "next/navigation";
import PatientShell from "./PatientShell";

export default function ConditionalShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  
  // Don't wrap with PatientShell on the join page
  if (pathname === "/join") {
    return <>{children}</>;
  }
  
  return <PatientShell>{children}</PatientShell>;
}
