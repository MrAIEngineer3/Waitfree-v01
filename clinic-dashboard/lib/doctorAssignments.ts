import { FirebaseError } from 'firebase/app';
import { arrayUnion, doc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

/**
 * Ensures the authenticated user is assigned to the provided doctor IDs for the clinic.
 * Assignments allow scheduling callables to authorize availability mutations for the doctors just created.
 */
export const assignDoctorsToCurrentUser = async (clinicId: string, doctorIds: string[]): Promise<void> => {
  if (!clinicId || doctorIds.length === 0) {
    return;
  }

  const user = auth.currentUser;
  if (!user) {
    throw new Error('No authenticated user available to update doctor assignments.');
  }

  const userRef = doc(db, 'users', user.uid);
  const fieldPath = `doctorAssignments.${clinicId}`;

  try {
    await updateDoc(userRef, {
      [fieldPath]: arrayUnion(...doctorIds)
    });
  } catch (error) {
    const firebaseError = error as FirebaseError;
    if (firebaseError.code === 'not-found') {
      const uniqueDoctorIds = Array.from(new Set(doctorIds));
      await setDoc(
        userRef,
        {
          doctorAssignments: {
            [clinicId]: uniqueDoctorIds
          }
        },
        { merge: true }
      );
      return;
    }
    console.error('[doctorAssignments] Failed to update doctor assignments', error);
    throw error;
  }
};
