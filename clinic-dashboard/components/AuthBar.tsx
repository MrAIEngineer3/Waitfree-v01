"use client";

import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signOut, User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { auth, db } from '../lib/firebase';

// Helper to create demo clinic/doctor/queue documents for local testing
async function ensureDemoClinicStructure() {
	const today = new Date().toISOString().split('T')[0];
	const clinicRef = doc(db, 'clinics', 'demo-clinic');
	const doctorRef = doc(db, 'clinics', 'demo-clinic', 'doctors', 'demo-doctor');
	const queueRef = doc(db, 'clinics', 'demo-clinic', 'doctors', 'demo-doctor', 'queues', today);

	try {
		const c = await getDoc(clinicRef);
		if (!c.exists()) {
			await setDoc(clinicRef, { name: 'Demo Clinic', createdAt: new Date().toISOString() });
			console.log('Created demo clinic doc');
		} else {
			console.log('Demo clinic doc already exists');
		}
		const d = await getDoc(doctorRef);
		if (!d.exists()) {
			await setDoc(doctorRef, { name: 'Demo Doctor', specialty: 'General', clinicId: 'demo-clinic', createdAt: new Date().toISOString() });
			console.log('Created demo doctor doc');
		} else {
			console.log('Demo doctor doc already exists');
		}
		const q = await getDoc(queueRef);
		if (!q.exists()) {
			await setDoc(queueRef, { status: 'active', currentToken: 0, totalPatients: 0, completedPatients: 0, createdAt: new Date().toISOString() });
			console.log('Created demo queue doc');
		} else {
			console.log('Demo queue doc already exists');
		}
		return { clinic: true, doctor: true, queue: true };
	} catch (err) {
		console.error('Failed to ensure demo clinic structure:', err);
		throw err;
	}
}

export default function AuthBar() {
	const [user, setUser] = useState<User | null>(null);
	const [mode, setMode] = useState<'signin' | 'signup'>('signin');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [clinicId, setClinicId] = useState('');
	const [doctorId, setDoctorId] = useState('');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);

	useEffect(() => {
		const unsub = onAuthStateChanged(auth, (u) => setUser(u));
		return () => unsub();
	}, []);

	const doSignUp = async () => {
		setError(null);
		setLoading(true);
		try {
			const cred = await createUserWithEmailAndPassword(auth, email, password);
			const uid = cred.user.uid;

			const userData: Record<string, unknown> = {
				email,
				createdAt: new Date().toISOString()
			};
			if (clinicId) userData.clinicId = clinicId;
			if (doctorId) userData.doctorId = doctorId;

			await setDoc(doc(db, 'users', uid), userData);

			} catch (err: unknown) {
				const msg = err instanceof Error ? err.message : String(err);
				setError(msg);
			} finally {
			setLoading(false);
		}
	};

	const doSignIn = async () => {
		setError(null);
		setLoading(true);
		try {
			await signInWithEmailAndPassword(auth, email, password);
			} catch (err: unknown) {
				const msg = err instanceof Error ? err.message : String(err);
				setError(msg);
			} finally {
			setLoading(false);
		}
	};

	const doSignOut = async () => {
		setError(null);
		try {
			await signOut(auth);
			} catch (err: unknown) {
				const msg = err instanceof Error ? err.message : String(err);
				setError(msg);
			}
	};

	// Create a demo account and automatically assign demo clinic/doctor mapping (no staff concept now)
	const createDemoAccount = async () => {
		setError(null);
		setSuccess(null);
		setLoading(true);
		try {
			// Create a unique demo email so repeated clicks work
			const demoEmail = `demo+user+${Date.now()}@example.com`;
			const demoPassword = 'DemoPass123!';

			// Create the user first so subsequent writes occur while authenticated
			const cred = await createUserWithEmailAndPassword(auth, demoEmail, demoPassword);
			const uid = cred.user.uid;

			// Ensure demo clinic/doctor/queue docs exist (authenticated write)
			await ensureDemoClinicStructure();
			console.log('ensureDemoClinicStructure finished');

			// Now write mapping to users/{uid} (retry a couple times if transient errors)
			const mapping = {
				email: demoEmail,
				clinicId: 'demo-clinic',
				doctorId: 'demo-doctor',
				createdAt: new Date().toISOString()
			};
			let attempts = 0;
			while (attempts < 3) {
				try {
					await setDoc(doc(db, 'users', uid), mapping);
					console.log('Wrote users/{uid} mapping for demo user:', uid);
					setSuccess(`Created demo user ${demoEmail}`);
					break;
				} catch (e) {
					console.warn('Failed to write users mapping, retrying...', attempts, e);
					attempts++;
					await new Promise((r) => setTimeout(r, 250));
					if (attempts >= 3) throw e;
				}
			}

			// Signed in automatically
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			setError(msg);
		} finally {
			setLoading(false);
		}
	};

	const loadProfile = async (u: User | null) => {
		if (!u) return;
			try {
				const snap = await getDoc(doc(db, 'users', u.uid));
				if (snap.exists()) {
					const data = snap.data() as { clinicId?: string; doctorId?: string } | undefined;
					if (data?.clinicId) setClinicId(data.clinicId);
					if (data?.doctorId) setDoctorId(data.doctorId);
				}
			} catch (err) {
				void err;
			}
	};

	useEffect(() => {
		loadProfile(user);
	}, [user]);

	return (
		<div className="mb-6">
			{user ? (
				<div className="flex items-center justify-between">
					<div className="text-sm text-gray-700">Signed in as <strong className="text-gray-900">{user.email}</strong></div>
					<div className="flex items-center gap-3">
						<button onClick={doSignOut} className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded">Sign out</button>
					</div>
				</div>
			) : (
				<div className="bg-gray-100 rounded-lg p-4">
					<div className="flex items-center justify-between mb-3">
						<div className="text-sm text-gray-700">Sign in / Sign up</div>
						<div className="text-xs text-gray-600">Mode: <strong>{mode}</strong></div>
					</div>

					<div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
						<input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="col-span-2 p-2 rounded bg-white border border-gray-300" />
						<input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" className="p-2 rounded bg-white border border-gray-300" />
					</div>

					{mode === 'signup' && (
						<div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
							<input value={clinicId} onChange={(e) => setClinicId(e.target.value)} placeholder="Clinic ID (optional)" className="col-span-2 p-2 rounded bg-white border border-gray-300" />
							<input value={doctorId} onChange={(e) => setDoctorId(e.target.value)} placeholder="Doctor ID (optional)" className="p-2 rounded bg-white border border-gray-300" />
						</div>
					)}

					<div className="flex items-center gap-3">
						{mode === 'signin' ? (
							<>
								<button onClick={doSignIn} disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded">Sign in</button>
								<button onClick={() => setMode('signup')} className="text-sm text-gray-700 underline">Create account</button>
							</>
						) : (
							<>
								<button onClick={doSignUp} disabled={loading} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded">Create account</button>
								<button onClick={() => setMode('signin')} className="text-sm text-gray-700 underline">Back to sign in</button>
							</>
						)}
					</div>

					<div className="mt-3">
						<button onClick={createDemoAccount} disabled={loading} className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded text-sm">Create demo account</button>
						<div className="text-xs text-gray-600 mt-2">Creates a demo clinic/doctor and signs you in (dev only).</div>
					</div>

					{error && <div className="mt-2 text-red-600 text-sm">{error}</div>}
					{success && <div className="mt-2 text-green-600 text-sm">{success}</div>}
					<div className="mt-2 text-xs text-gray-600">Simplified mode: any authenticated user can manage queues.</div>
				</div>
			)}
		</div>
	);
}
