"use client";
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { Button } from './ui/Button';
import { useUserMapping } from './useUserMapping';

export default function AccountBadge() {
  const { email, mapping, loading } = useUserMapping();

  if (loading) {
    return (
      <div className="h-8 px-4 rounded-full bg-background/60 border border-border flex items-center gap-2 animate-pulse text-[11px] text-muted-foreground">
        <div className="w-16 h-3 bg-muted rounded" />
        <div className="w-10 h-3 bg-muted rounded" />
      </div>
    );
  }

  if (!email) {
    return (
      <div className="flex items-center gap-2 text-xs">
        {/* Sign in becomes a neutral elevated action */}
        <Button size="sm" variant="secondary" className="px-3" onClick={() => { window.location.href = '/auth/login'; }}>Sign In</Button>
        {/* Creation / new entity highlighted with accent */}
        <Button size="sm" variant="accent" className="px-3" onClick={() => { window.location.href = '/auth/signup'; }}>Create Clinic</Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 text-xs bg-background/70 border border-border rounded-full pl-3 pr-1.5 py-1 shadow-sm">
      <div className="flex flex-col leading-tight pr-1">
        <span className="font-semibold text-foreground">{mapping?.doctorName || email}</span>
        <span className="text-[10px] text-muted-foreground">{mapping?.clinicName || 'Clinic pending'}{mapping?.specialty ? ` • ${mapping.specialty}` : ''}</span>
      </div>
      <Button size="sm" variant="ghost" onClick={()=>signOut(auth)} className="h-6 text-[11px] px-2">Sign out</Button>
    </div>
  );
}
