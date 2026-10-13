/**
 * One-off migration for data written before the security rules existed.
 *
 *   1. Moves participant emails off public entry docs into the private
 *      subcollection (entries are publicly readable; private is not).
 *   2. Registers a /joinCodes doc for older sweeps so their join links keep
 *      working now that sweeps can't be queried by code.
 *
 * Idempotent — safe to run more than once. Run after deploying, then delete:
 *   curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://<site>/api/cron/migrate
 */
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

function getDb() {
  if (!getApps().length) {
    initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)) });
  }
  return getFirestore();
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return res.status(503).json({ error: 'CRON_SECRET not configured' });
  if (req.method !== 'POST' || req.headers['authorization'] !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const db = getDb();
  let emailsMoved = 0;
  let codesAdded = 0;

  const sweeps = await db.collection('sweeps').get();
  for (const sweepDoc of sweeps.docs) {
    const sweep = sweepDoc.data();

    const code = sweep.joinCode;
    if (typeof code === 'string' && /^[A-Z0-9]{4,8}$/.test(code)) {
      const ref = db.collection('joinCodes').doc(code);
      if (!(await ref.get()).exists) {
        await ref.set({ sweepId: sweepDoc.id, creatorId: sweep.creatorId || null });
        codesAdded += 1;
      }
    }

    const entries = await sweepDoc.ref.collection('entries').get();
    for (const entry of entries.docs) {
      const { email, userId } = entry.data();
      if (!email) continue;
      const batch = db.batch();
      batch.set(sweepDoc.ref.collection('private').doc(entry.id), { userId: userId || null, email }, { merge: true });
      batch.update(entry.ref, { email: FieldValue.delete() });
      await batch.commit();
      emailsMoved += 1;
    }
  }

  return res.json({ sweeps: sweeps.size, emailsMoved, codesAdded });
}
