'use client';

import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { db, functions } from '../../lib/firebase';

export default function JoinForm() {
  // State management
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  // Phone: 10 digits (no international support)
  const [phone, setPhone] = useState('');
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  // Dynamic clinic/doctor ids and status
  const [clinicId, setClinicId] = useState<string | null>(null);
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [doctors, setDoctors] = useState<Array<{ id: string; name?: string; specialty?: string }>>([]);
  const [status, setStatus] = useState<'loading' | 'valid' | 'invalid'>('loading');
  const [clinicName, setClinicName] = useState('');
  const [clinicData, setClinicData] = useState<{ name?: string; address?: string; phone?: string } | null>(null);
  const [doctorsLoading, setDoctorsLoading] = useState(false);
  const [doctorIdParamProvided, setDoctorIdParamProvided] = useState(false);

  // Router for navigation
  const router = useRouter();
  // No useSearchParams to avoid route re-fetch loops; read from window.location instead.

  // One-time init guard for reading URL params and fetching initial data
  // Must be declared at the top level to comply with React Hooks rules
  const initOnceRef = useRef(false);

  // Form submission handler
  const handleJoinQueue = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Basic validation
    if (!name.trim() || !age.trim()) {
      setError('Please fill in all fields');
      return;
    }
    const normalizedDigits = phone.replace(/\D+/g, '');
    if (normalizedDigits.length !== 10) {
      setPhoneTouched(true);
      return;
    }

    const ageNumber = parseInt(age);
    if (isNaN(ageNumber) || ageNumber <= 0 || ageNumber > 200) {
      setError('Please enter a valid age');
      return;
    }

    setIsLoading(true);

    try {
      // Ensure clinicId/doctorId are present before submitting
      if (!clinicId || !doctorId) {
        setError('Missing clinic or doctor information. Please scan the clinic QR code again.');
        setIsLoading(false);
        return;
      }

      // Call the Cloud Function
      const joinFn = httpsCallable(functions, 'joinQueue');

      const callResult = await joinFn({
        clinicId,
        doctorId,
        patientData: {
          name: name.trim(),
          age: ageNumber,
          phone: normalizedDigits,
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
  // Redirect with one-time token in URL so the status page can persist and scrub it
  const joinUrl = `/queue/${cId}/${dId}/${queueId}/${patientId}${accessToken ? `?t=${encodeURIComponent(accessToken)}` : ''}`;
  router.push(joinUrl);
      } else {
        setError('Failed to join queue. Please try again.');
      }
    } catch (err: any) {
      console.error('Error calling joinQueue callable function:', err);
      setError(err?.message || 'Failed to join queue. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // When still determining IDs from URL
  useEffect(() => {
    // Guard to ensure initialization runs only once on the client
    if (initOnceRef.current) return;
    initOnceRef.current = true;
    try {
      // Read query params once on mount to avoid dependency loops / repeated fetches
      let rawC = '';
      let rawD = '';
      if (typeof window !== 'undefined') {
        const qp = new URLSearchParams(window.location.search);
        rawC = qp.get('clinicId') || qp.get('c') || '';
        rawD = qp.get('doctorId') || qp.get('d') || '';
      } else {
        // SSR safety fallback: leave empty; client will populate on mount
        rawC = '';
        rawD = '';
      }

      // Helper to coerce clinic/doctor IDs into safe Firestore path segments
      const coerceId = (value: string | null | undefined): string | null => {
        if (!value) return null;
        const str = String(value).trim();
        if (!str) return null;
        // If it's a full URL, attempt to read the param from it
        try {
          const u = new URL(str);
          const byQuery = u.searchParams.get('clinicId') || u.searchParams.get('doctorId') || u.searchParams.get('c') || u.searchParams.get('d');
          if (byQuery && /^[A-Za-z0-9-_.~]+$/.test(byQuery)) return byQuery;
        } catch (_) { /* not a URL */ }
        // Otherwise allow a conservative character set
        const cleaned = str.match(/[A-Za-z0-9-_.~]+/g)?.join('') || '';
        return cleaned || null;
      };

    const c = coerceId(rawC);
    const d = coerceId(rawD);
    setDoctorIdParamProvided(!!d);

      if (c) {
        setClinicId(c);
        setStatus('valid');

        const fetchClinic = async () => {
          try {
            const clinicRef = doc(db, 'clinics', c);
            const docSnap = await getDoc(clinicRef);
            if (docSnap.exists()) {
              const data = docSnap.data() as any;
              setClinicData(data);
              if (data && data.name) setClinicName(data.name);
            }
          } catch (err) {
            console.error('Error fetching clinic:', err);
          }
        };
        fetchClinic();

        if (d) {
          setDoctorId(d);
        } else {
          setDoctorId(null);
          const fetchDoctors = async () => {
            try {
              setDoctorsLoading(true);
              const { collection, getDocs } = await import('firebase/firestore');
              const doctorsCol = await getDocs(collection(db, 'clinics', c, 'doctors'));
              const list: Array<{ id: string; name?: string; specialty?: string }> = [];
              doctorsCol.forEach((docSnap: any) => {
                const data = docSnap.data();
                list.push({ 
                  id: docSnap.id, 
                  name: data?.name || docSnap.id,
                  specialty: data?.specialty || 'General Practice'
                });
              });
              setDoctors(list);
              if (list.length === 1) {
                setDoctorId(list[0].id);
              }
            } catch (err) {
              console.error('Error fetching doctors:', err);
            } finally {
              setDoctorsLoading(false);
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
  }, []);

  // Safety fallback: if initialization never runs (e.g., unexpected dev/HMR behavior),
  // don't leave users stuck on skeleton indefinitely.
  useEffect(() => {
    if (status !== 'loading') return;
    const timer = setTimeout(() => {
      // If still loading after 6s, mark invalid so user sees an action.
      setStatus((s) => (s === 'loading' ? 'invalid' : s));
    }, 6000);
    return () => clearTimeout(timer);
  }, [status]);

  if (status === 'loading') {
    // Compact centered skeleton while resolving clinic/doctor
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50/30 via-white to-indigo-50/30 flex items-center justify-center px-4 py-6">
        <div className="w-full max-w-sm flex justify-center">
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl border border-slate-200/80 shadow-xl overflow-hidden w-full">
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-slate-200 animate-pulse" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-2/3 bg-slate-200 rounded animate-pulse" />
                  <div className="h-2.5 w-1/2 bg-slate-200 rounded animate-pulse" />
                </div>
              </div>
              <div className="h-8 bg-slate-200 rounded animate-pulse" />
              <div className="grid grid-cols-5 gap-3">
                <div className="h-10 bg-slate-200 rounded col-span-2 animate-pulse" />
                <div className="h-10 bg-slate-200 rounded col-span-3 animate-pulse" />
              </div>
              <div className="h-10 bg-slate-200 rounded animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'invalid') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50/30 via-white to-indigo-50/30 flex flex-col justify-center px-4 py-6">
        <div className="max-w-sm mx-auto w-full flex justify-center">
          <div className="bg-white/90 backdrop-blur-sm rounded-xl border border-gray-200/60 shadow-xl overflow-hidden w-full">
            <div className="px-6 py-6 text-center space-y-4">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-red-100">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 15.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div className="space-y-2">
                <h2 className="text-base font-semibold text-gray-900">Invalid Clinic Link</h2>
                <p className="text-gray-600 leading-relaxed text-sm max-w-xs mx-auto">
                  The clinic link appears to be invalid. Please scan the QR code again or contact the clinic for assistance.
                </p>
              </div>
              <button 
                onClick={() => window.history.back()} 
                className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 shadow-md shadow-blue-500/25"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Go Back
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div aria-live="polite" className="min-h-screen text-slate-800 bg-gradient-to-br from-blue-50/30 via-white to-indigo-50/30">
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {isLoading ? 'Submitting your details…' : ''}
        {error ? `Error: ${error}` : ''}
      </div>

      <main className="relative min-h-screen w-full flex items-center justify-center p-4">
        <div className="w-full max-w-sm mx-auto flex justify-center">
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl border border-slate-200/80 shadow-xl overflow-hidden w-full">
            
            {/* Minimal Clinic Header */}
            <div className="px-5 py-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-slate-100">
              <div className="text-center">
                <h1 className="text-lg font-bold text-slate-900">{clinicData?.name || clinicName || 'Clinic'}</h1>
                <p className="text-xs text-slate-600 mt-0.5">Virtual Queue System</p>
              </div>
            </div>

            {/* Inline Doctor Info (if single doctor) */}
            {(!doctorIdParamProvided && doctors.length === 1) ? (
              <div className="px-5 py-3 bg-green-50/50 border-b border-slate-100">
                {doctorsLoading ? (
                  <div className="h-6 rounded bg-slate-200 animate-pulse" />
                ) : (
                  <div className="flex items-center justify-center gap-2 text-center">
                    <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    </div>
                    <span className="text-sm font-medium text-slate-800">
                      {doctors[0]?.name || doctors[0]?.id}
                    </span>
                    <span className="text-xs text-slate-500">
                      ({doctors[0]?.specialty || 'Available'})
                    </span>
                  </div>
                )}
              </div>
            ) : null}

            {/* Multiple Doctor Selection (compact) */}
            {(!doctorIdParamProvided && doctors.length > 1) ? (
              <div className="px-5 py-3 border-b border-slate-100">
                <p className="text-xs font-medium text-slate-600 mb-2 text-center">Select Doctor</p>
                <div className="space-y-1">
                  {doctorsLoading ? (
                    <div className="h-8 rounded-lg bg-slate-200 animate-pulse" />
                  ) : (
                    doctors.map((d) => {
                      const selected = doctorId === d.id;
                      const initials = (d.name || d.id).split(' ').map(p => p[0]).join('').slice(0,2).toUpperCase();
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => setDoctorId(d.id)}
                          className={`w-full text-left rounded-lg border px-3 py-2 flex items-center gap-2.5 transition-all ${selected ? 'border-blue-400 bg-blue-50 shadow-sm' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}
                          aria-pressed={selected}
                        >
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${selected ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                            {initials}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate text-slate-800">{d.name || d.id}</p>
                            <p className="text-xs text-slate-500 truncate">{d.specialty || 'General Practice'}</p>
                          </div>
                          {selected && (
                            <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center">
                              <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            </div>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            ) : null}

            {/* Streamlined Form */}
            <div className="px-5 py-5">
              {error && (
                <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 text-center">
                  {error}
                </div>
              )}

              <form className="space-y-3" onSubmit={handleJoinQueue}>
                {/* Full Name */}
                <div className="relative">
                  <svg className="absolute top-1/2 left-3 -translate-y-1/2 w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M6 21v-2a4 4 0 014-4h4a4 4 0 014 4v2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <input
                    id="fullName"
                    placeholder="Your full name"
                    className="w-full pl-10 pr-4 py-3 rounded-xl border-2 border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:border-blue-400 focus:outline-none text-sm transition-all"
                    required
                    autoComplete="name"
                    autoCapitalize="words"
                    type="text"
                    name="fullName"
                    aria-label="Full Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={isLoading}
                  />
                </div>

                {/* Age and Phone in row */}
                <div className="grid grid-cols-5 gap-3">
                  <div className="relative col-span-2">
                    <svg className="absolute top-1/2 left-2.5 -translate-y-1/2 w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path d="M7 8h10M7 12h4M7 16h4M7 4c0-1.1.9-2 2-2h6c1.1 0 2 .9 2 2v16c0 1.1-.9 2-2 2H9c-1.1 0-2-.9-2-2V4z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <input
                      id="age"
                      placeholder="Age"
                      min={1}
                      max={150}
                      className="w-full pl-9 pr-3 py-3 rounded-xl border-2 border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:border-blue-400 focus:outline-none text-sm transition-all"
                      required
                      inputMode="numeric"
                      type="tel"
                      name="age"
                      aria-label="Age"
                      value={age}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D+/g, '');
                        setAge(digits.slice(0, 3));
                      }}
                      maxLength={3}
                      disabled={isLoading}
                    />
                  </div>
                  <div className="relative col-span-3">
                    <svg className="absolute top-1/2 left-2.5 -translate-y-1/2 w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path d="M22 16.92V19a2 2 0 01-2.18 2A19.79 19.79 0 013 5.18 2 2 0 015 3h2.09a2 2 0 012 1.72 12.66 12.66 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 10.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.66 12.66 0 002.81.7A2 2 0 0122 16.92z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <input
                      id="phoneNumber"
                      placeholder="Phone number"
                      className={`w-full pl-9 pr-3 py-3 rounded-xl border-2 bg-white text-slate-900 placeholder-slate-400 focus:outline-none transition-all text-sm ${
                        phoneTouched && phone.replace(/\D+/g,'').length !== 10 
                          ? 'border-red-300 focus:border-red-400' 
                          : 'border-slate-200 focus:border-blue-400'
                      }`}
                      required
                      inputMode="tel"
                      maxLength={10}
                      autoComplete="tel"
                      type="tel"
                      name="phoneNumber"
                      aria-label="Phone Number"
                      value={phone}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D+/g, '');
                        setPhone(digits.slice(0, 10));
                      }}
                      onBlur={() => setPhoneTouched(true)}
                      disabled={isLoading}
                      aria-invalid={phoneTouched && phone.replace(/\D+/g,'').length !== 10}
                    />
                  </div>
                </div>
                {phoneTouched && phone.replace(/\D+/g,'').length !== 10 && (
                  <p className="text-xs text-red-600 text-center">
                    Please enter a valid 10-digit phone number
                  </p>
                )}

                {/* Submit Button */}
                <button
                  type="submit"
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold py-3.5 px-4 rounded-xl shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:from-slate-300 disabled:to-slate-400 disabled:shadow-none disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2 text-sm"
                  disabled={isLoading || !doctorId}
                >
                  {isLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
                      Joining...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M5 12l5 5L20 7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Join Queue
                    </>
                  )}
                </button>
              </form>

              <p className="text-xs text-slate-500 text-center mt-4 flex items-center justify-center gap-1">
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" strokeWidth="2"/>
                </svg>
                Your information is secure
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Loading Overlay */}
      {isLoading && (
        <div className="fixed inset-0 bg-white/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6 max-w-sm mx-4">
            <div className="text-center space-y-3">
              <div className="inline-flex items-center justify-center w-10 h-10 bg-blue-100 rounded-full">
                <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900 mb-1">Joining Queue</h3>
                <p className="text-sm text-gray-600">Please wait while we add you to the queue...</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// (no international phone formatting helper; enforcing 10 digits locally)
