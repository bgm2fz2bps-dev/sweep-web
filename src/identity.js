import { auth } from './firebase';

/**
 * Returns this browser's identity: the Firebase anonymous-auth UID.
 *
 * This must be the auth UID (not a random localStorage UUID) because the
 * Firestore security rules check `request.auth.uid` against `creatorId` /
 * `userId`. Anonymous auth persists in IndexedDB, so the UID is stable across
 * tabs and reloads in the same browser — the same lifetime the old
 * localStorage UUID had.
 *
 * App.jsx doesn't render any routes until sign-in has completed, so
 * currentUser is always set by the time a page calls this.
 */
export function getSessionId() {
  return auth.currentUser?.uid ?? null;
}

/** Save a sweep ID to this device's local list (called on create or join). */
export function saveSweepLocally(sweepId) {
  const ids = getLocalSweepIds();
  if (!ids.includes(sweepId)) {
    ids.push(sweepId);
    try { localStorage.setItem('mySweepIds', JSON.stringify(ids)); } catch { /* storage blocked */ }
  }
}

/** Get all sweep IDs saved on this device. */
export function getLocalSweepIds() {
  try {
    return JSON.parse(localStorage.getItem('mySweepIds') || '[]');
  } catch {
    return [];
  }
}
