"use client";

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function ClinicIdEntry() {
  const router = useRouter();
  const [clinicId, setClinicId] = useState('');

  const goToJoin = () => {
    const trimmed = clinicId.trim();
    if (!trimmed) return;
    router.push(`/join?clinicId=${encodeURIComponent(trimmed)}`);
  };

  return (
    <div className="flex items-center gap-2">
      <input
        value={clinicId}
        onChange={(e) => setClinicId(e.target.value)}
        placeholder="Enter clinic ID"
        className="px-3 py-2 border border-gray-300 rounded-md text-sm"
      />
      <button
        onClick={goToJoin}
        className="inline-block bg-gray-800 text-white px-3 py-2 rounded-md text-sm hover:bg-gray-900"
      >
        Open
      </button>
    </div>
  );
}
