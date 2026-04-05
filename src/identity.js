/**
 * Returns a stable identity for this browser/device.
 * Uses localStorage so it persists across tabs and sessions.
 */
export function getSessionId() {
  let id = localStorage.getItem('sweepSessionId');
  if (!id) {
    // Migrate from sessionStorage if a session exists (handles old sessions)
    id = sessionStorage.getItem('sweepSessionId') || crypto.randomUUID();
    localStorage.setItem('sweepSessionId', id);
  }
  return id;
}
