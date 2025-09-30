"use client";

import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { db, functions } from '../../lib/firebase';

export default function JoinForm() {
  // State management
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [phone, setPhone] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  // Dynamic clinic/doctor ids and status
  const [clinicId, setClinicId] = useState<string | null>(null);
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [doctors, setDoctors] = useState<Array<{ id: string; name?: string }>>([]);
  const [status, setStatus] = useState<'loading' | 'valid' | 'invalid'>('loading');
  const [clinicName, setClinicName] = useState('');

  // Router for navigation
  const router = useRouter();
  const searchParams = useSearchParams();

  // Form submission handler
  const handleJoinQueue = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Basic validation
    if (!name.trim() || !age.trim() || !phone.trim()) {
      setError('Please fill in all fields');
      return;
    }

    const ageNumber = parseInt(age);
    if (isNaN(ageNumber) || ageNumber <= 0 || ageNumber > 150) {
      setError('Please enter a valid age');
      return;
    }

    setIsLoading(true);

    try {
      // Determine emulator usage and environment; firebase lib will connect functions emulator
      const explicitBase = process.env.NEXT_PUBLIC_FUNCTIONS_BASE_URL;
      const useEmulator = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true';
      const region = 'asia-south1';
      const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'waitfree-9b06e';
      // Keep previous safety checks for local dev to avoid accidental production calls
      if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
        const emulatorExpected = useEmulator || process.env.NODE_ENV === 'development';
        if (emulatorExpected && !useEmulator) {
          console.error('[JoinForm] Blocking request: expected emulator but NEXT_PUBLIC_USE_FIREBASE_EMULATOR is not set');
          setError('Internal configuration error (emulator not engaged). Please refresh after setting env vars.');
          setIsLoading(false);
          return;
        }
      }

      // Ensure clinicId/doctorId are present before submitting
      if (!clinicId || !doctorId) {
        setError('Missing clinic or doctor information. Please scan the clinic QR code again.');
        setIsLoading(false);
        return;
      }

      // Call the Cloud Function using callable functions (onCall/onCallable)
      try {
        const joinFn = httpsCallable(functions, 'joinQueue');
        const callResult = await joinFn({
          clinicId,
          doctorId,
          patientData: {
            name: name.trim(),
            age: ageNumber,
            phone: phone.trim(),
          },
        });
        const result = callResult?.data as any;

        if (result && result.patientId) {
          const { patientId, queueId, doctorId: dId, clinicId: cId, accessToken } = result;
          try {
            if (accessToken && patientId) {
              sessionStorage.setItem(`patientToken:${patientId}`, accessToken);
            }
          } catch (e) {
            console.warn('Failed to store access token in sessionStorage', e);
          }
          router.push(`/queue/${cId}/${dId}/${queueId}/${patientId}`);
        } else {
          setError('Failed to join queue. Please try again.');
        }
      } catch (err: any) {
        // firebase functions SDK throws a structured error; fall back to message
        console.error('Error calling joinQueue callable function:', err);
        setError(err?.message || 'Failed to join queue. Please try again.');
      }
    } catch (err) {
      console.error('Error joining queue:', err);
      setError('Network error. Please check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // When still determining IDs from URL
  useEffect(() => {
    try {
      const c = searchParams?.get('clinicId');
      const d = searchParams?.get('doctorId');

      if (c) {
        setClinicId(c);
        setStatus('valid');

        // Fetch clinic name for header
        const fetchClinic = async () => {
          try {
            const clinicRef = doc(db, 'clinics', c);
            const docSnap = await getDoc(clinicRef);
            if (docSnap.exists()) {
              const data = docSnap.data() as any;
              if (data && data.name) setClinicName(data.name);
            }
          } catch (err) {
            console.error('Error fetching clinic:', err);
          }
        };

        fetchClinic();

        // If doctor id is provided in params, use it. Otherwise list doctors from the clinic.
        if (d) {
          setDoctorId(d);
        } else {
          setDoctorId(null);
          const fetchDoctors = async () => {
            try {
              // Read doctors subcollection for the clinic and map ids
              const doctorsCol = await import('firebase/firestore').then((m) => {
                const { collection, getDocs } = m;
                return getDocs(collection(db, 'clinics', c, 'doctors'));
              });
              const list: Array<{ id: string; name?: string }> = [];
              doctorsCol.forEach((docSnap: any) => {
                const data = docSnap.data();
                list.push({ id: docSnap.id, name: data?.name });
              });
              setDoctors(list);
            } catch (err) {
              console.error('Error fetching doctors:', err);
            }
          };

          fetchDoctors();
        }
      } else {
        setClinicId(c ?? null);
        setDoctorId(d ?? null);
        setStatus('invalid');
      }
    } catch (err) {
      console.error('Error reading search params', err);
      setStatus('invalid');
    }
  }, [searchParams]);

  if (status === 'loading') {
    return <div className="flex items-center justify-center py-20">Loading...</div>;
  }

  if (status === 'invalid') {
    return (
      <div className="flex items-center justify-center py-20 px-4">
        <div className="max-w-md text-center bg-white/70 backdrop-blur rounded-xl shadow-sm border border-gray-200 p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Invalid QR Code</h2>
          <p className="text-gray-600">Please scan the code at the clinic again.</p>
        </div>
      </div>
    );
  }

  return (
    <div aria-describedby="join-form-status-region">
      <div id="join-form-status-region" aria-live="polite" className="sr-only">{error ? `Error: ${error}` : clinicName ? `Joining queue for ${clinicName}` : 'Join queue form loaded'}</div>
      <div className="max-w-lg mx-auto px-2 sm:px-4 py-2 sm:py-6">
        <div className="text-center mb-10">
          <h1 className="wf-animated-gradient text-3xl sm:text-4xl font-bold tracking-tight mb-4">{clinicName || 'Join the Queue'}</h1>
          <p className="text-gray-600 text-sm max-w-md mx-auto">Provide your basic details so we can assign a token and keep you updated in real-time.</p>
        </div>

        <div className="wf-card p-6 sm:p-8">
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-2 h-2 bg-red-600 rounded-full"></div>
                </div>
                <div className="ml-3">
                  <p className="text-red-800 font-medium text-sm">{error}</p>
                </div>
              </div>
            </div>
          )}

          <form className="space-y-7" onSubmit={handleJoinQueue}>
            <div className="wf-field">
              {doctorId ? (
                <>
                  <select
                    id="doctor"
                    name="doctor"
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-gray-50 text-gray-700 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40 disabled:opacity-70"
                    value={doctorId}
                    disabled
                  >
                    <option value={doctorId}>{`Doctor: ${doctorId}`}</option>
                  </select>
                  <label htmlFor="doctor">Selected Doctor</label>
                  <p className="text-[11px] text-gray-500 mt-1">Scanned: {doctorId}</p>
                </>
              ) : (
                <>
                  <select
                    id="doctor"
                    name="doctor"
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-white text-gray-900 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40 disabled:opacity-70"
                    value={doctorId ?? ''}
                    onChange={(e) => setDoctorId(e.target.value || null)}
                    required
                  >
                    <option value="">Select a doctor</option>
                    {doctors.length === 0 ? (
                      <option value="" disabled>No doctors found</option>
                    ) : (
                      doctors.map((doc) => (
                        <option key={doc.id} value={doc.id}>{doc.name ? `${doc.name}` : doc.id}</option>
                      ))
                    )}
                  </select>
                  <label htmlFor="doctor">Doctor</label>
                  <p className="text-[11px] text-gray-500 mt-1">Choose a doctor to continue</p>
                </>
              )}
            </div>

            <div className="wf-field">
              <input
                type="text"
                id="fullName"
                name="fullName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder=" "
                className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-white text-gray-900 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40 disabled:opacity-70 placeholder-transparent"
                required
                disabled={isLoading}
                autoComplete="name"
              />
              <label htmlFor="fullName">Full Name</label>
            </div>

            <div className="wf-field grid grid-cols-2 gap-4">
              <div className="relative">
                <input
                  type="number"
                  id="age"
                  name="age"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder=" "
                  min="1"
                  max="150"
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-white text-gray-900 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40 disabled:opacity-70 placeholder-transparent"
                  required
                  disabled={isLoading}
                  inputMode="numeric"
                />
                <label htmlFor="age">Age</label>
              </div>
              <div className="relative wf-field">
                <input
                  type="tel"
                  id="phoneNumber"
                  name="phoneNumber"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder=" "
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-white text-gray-900 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40 disabled:opacity-70 placeholder-transparent"
                  required
                  disabled={isLoading}
                  inputMode="tel"
                  autoComplete="tel"
                />
                <label htmlFor="phoneNumber">Phone</label>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="wf-glow relative w-full text-white px-6 py-4 rounded-xl font-semibold text-sm bg-gradient-to-r from-blue-600 to-cyan-500 shadow-lg shadow-blue-600/25 hover:shadow-blue-600/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-600 disabled:from-gray-400 disabled:to-gray-500 disabled:shadow-none disabled:cursor-not-allowed flex items-center justify-center tracking-wide"
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/80 border-t-transparent rounded-full animate-spin mr-3" />
                  Joining...
                </>
              ) : (
                'Join Queue'
              )}
            </button>
          </form>
        </div>
        <div className="text-center mt-6">
          <p className="text-[11px] text-gray-500">We only use your details to assign and manage your token.</p>
        </div>
      </div>
    </div>
  );
}
