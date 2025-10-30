"use client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { collection, doc, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { auth, db } from '../lib/firebase';

interface Doctor { id: string; name: string; specialty?: string }
interface DoctorDoc { name?: string; specialty?: string }

export default function DoctorPicker({ clinicId, value, onChange }:{ clinicId: string; value?: string | null; onChange?: (id: string)=>void }){
  const [list, setList] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const col = useMemo(()=> collection(db, 'clinics', clinicId, 'doctors'), [clinicId]);
  useEffect(()=>{
    const q = query(col, orderBy('name'));
    const unsub = onSnapshot(q, (snap)=>{
      const docs: Doctor[] = [];
      snap.forEach((d)=>{
        const data = (d.data() as DoctorDoc | undefined) ?? {};
        docs.push({
          id: d.id,
          name: data.name ?? 'Unknown doctor',
          specialty: data.specialty,
        });
      });
      setList(docs); setLoading(false);
    }, ()=> setLoading(false));
    return ()=> unsub();
  }, [col]);

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
