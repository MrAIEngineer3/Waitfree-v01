"use client";
import { collection, doc, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore';
import { type ChangeEvent, useEffect, useMemo, useState } from 'react';
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

  async function handleChange(e: ChangeEvent<HTMLSelectElement>){
    const id = e.target.value;
    try{
      const u = auth.currentUser;
      if (u) await updateDoc(doc(db, 'users', u.uid), { doctorId: id });
      if (onChange) onChange(id);
    } catch {}
  }

  const hasSelection = !!value;
  return (
    <div className="inline-flex items-center">
      <select
        value={value ?? ''}
        onChange={handleChange}
        className="h-8 text-sm rounded-md border border-gray-300 px-2 bg-white text-gray-800"
        aria-label="Select doctor"
      >
        {loading && <option>Loading…</option>}
        {!loading && !hasSelection && <option value="" disabled>Select a doctor…</option>}
        {!loading && list.length === 0 && <option value="" disabled>No doctors found</option>}
        {!loading && list.map(d=> (
          <option key={d.id} value={d.id}>{d.name}{d.specialty? ` • ${d.specialty}`: ''}</option>
        ))}
      </select>
    </div>
  );
}
