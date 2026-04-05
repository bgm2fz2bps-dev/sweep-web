/**
 * Returns a stable identity for this browser/device.
 * Uses localStorage so it persists across tabs and sessions.
 */
export function getSessionId() {
  let id = localStorage.getItem('sweepSessionId');
  if (!id) {
    id = sessionStorage.getItem('sweepSessionId') || crypto.randomUUID();
    localStorage.setItem('sweepSessionId', id);
  }
  return id;
}

/** Save a sweep ID to this device's local list (called on create or join). */
export function saveSweepLocally(sweepId) {
  const ids = getLocalSweepIds();
  if (!ids.includes(sweepId)) {
    ids.push(sweepId);
    localStorage.setItem('mySweepIds', JSON.stringify(ids));
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
