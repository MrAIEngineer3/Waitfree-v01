"use client";
import { useQuery } from '@tanstack/react-query';
import { doc, updateDoc } from 'firebase/firestore';
import { useMemo } from 'react';
import { auth, db } from '../lib/firebase';
import type { ClinicDoctorListEntry } from './ClinicContextProvider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

interface Doctor { id: string; name: string; specialty?: string }

export default function DoctorPicker({ clinicId, value, onChange }:{ clinicId: string; value?: string | null; onChange?: (id: string)=>void }){
  const doctorsQueryKey = useMemo(() => ['doctors', clinicId] as const, [clinicId]);
  const doctorsQuery = useQuery<ClinicDoctorListEntry[]>({
    queryKey: doctorsQueryKey,
    enabled: false,
    queryFn: async () => [],
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
  });

  const list = useMemo<Doctor[]>(() => {
    const next = doctorsQuery.data ?? [];
    return next.map((entry) => ({
      id: entry.id,
      name: entry.name || 'Unknown doctor',
      specialty: entry.specialty ?? undefined,
    }));
  }, [doctorsQuery.data]);

  const loading = doctorsQuery.data === undefined;

  async function handleChange(id: string){
    try{
      const u = auth.currentUser;
      if (u) await updateDoc(doc(db, 'users', u.uid), { doctorId: id });
      if (onChange) onChange(id);
    } catch {}
  }

  return (
    <div className="inline-flex items-center">
      <Select
        value={value ?? ''}
        onValueChange={handleChange}
      >
        <SelectTrigger className="h-8 text-sm rounded-md border border-border px-2 bg-background text-foreground">
          <SelectValue placeholder={loading ? "Loading…" : "Select a doctor…"} />
        </SelectTrigger>
        <SelectContent>
          {!loading && list.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">No doctors found</div>
          )}
          {!loading && list.map(d=> (
            <SelectItem key={d.id} value={d.id}>{d.name}{d.specialty? ` • ${d.specialty}`: ''}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
