import { assignDoctorsToCurrentUser } from '../doctorAssignments';
import { auth } from '../firebase';

const firestoreMocks = vi.hoisted(() => ({
  docMock: vi.fn((..._args: unknown[]) => ({ path: 'users/user-123' })),
  updateDocMock: vi.fn(),
  setDocMock: vi.fn(),
  arrayUnionMock: vi.fn((...values: unknown[]) => ({ __arrayUnion: values })),
}));

const firebaseMocks = vi.hoisted(() => ({
  authMock: { currentUser: { uid: 'user-123' } },
  dbMock: {},
}));

vi.mock('firebase/firestore', () => ({
  doc: firestoreMocks.docMock,
  updateDoc: firestoreMocks.updateDocMock,
  setDoc: firestoreMocks.setDocMock,
  arrayUnion: firestoreMocks.arrayUnionMock,
}));

vi.mock('../firebase', () => ({
  auth: firebaseMocks.authMock,
  db: firebaseMocks.dbMock,
}));

describe('assignDoctorsToCurrentUser', () => {
  const mutableAuth = auth as unknown as { currentUser: unknown };
  const { docMock, updateDocMock, setDocMock, arrayUnionMock } = firestoreMocks;

  beforeEach(() => {
    vi.clearAllMocks();
    firebaseMocks.authMock.currentUser = { uid: 'user-123' };
    mutableAuth.currentUser = firebaseMocks.authMock.currentUser;
  });

  it('no-ops when clinicId is missing or doctorIds empty', async () => {
    await assignDoctorsToCurrentUser('', ['docA']);
    await assignDoctorsToCurrentUser('clinic-1', []);

    expect(updateDocMock).not.toHaveBeenCalled();
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it('updates assignments via arrayUnion when user document exists', async () => {
    await assignDoctorsToCurrentUser('clinic-1', ['docA', 'docB']);

    expect(docMock).toHaveBeenCalledWith(expect.anything(), 'users', 'user-123');
    expect(updateDocMock).toHaveBeenCalledWith(expect.anything(), {
      'doctorAssignments.clinic-1': expect.any(Object),
    });
    expect(arrayUnionMock).toHaveBeenCalledWith('docA', 'docB');
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it('creates doctorAssignments map when user document is missing', async () => {
    updateDocMock.mockRejectedValueOnce({ code: 'not-found' });

    await assignDoctorsToCurrentUser('clinic-2', ['docA', 'docA', 'docC']);

    expect(setDocMock).toHaveBeenCalledWith(
      expect.anything(),
      {
        doctorAssignments: {
          'clinic-2': ['docA', 'docC'],
        },
      },
      { merge: true }
    );
  });

  it('throws when no authenticated user is available', async () => {
    mutableAuth.currentUser = null;

    await expect(assignDoctorsToCurrentUser('clinic-1', ['docA'])).rejects.toThrow(
      'No authenticated user available to update doctor assignments.'
    );
    expect(updateDocMock).not.toHaveBeenCalled();
  });
});
