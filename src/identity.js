/**
 * Returns a stable identity for this browser tab/session.
 * Uses sessionStorage so each tab gets its own UUID.
 * Display name stays in localStorage (shared across tabs on the same device).
 */
export function getSessionId() {
  let id = sessionStorage.getItem('sweepSessionId');
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem('sweepSessionId', id);
  }
  return id;
}
