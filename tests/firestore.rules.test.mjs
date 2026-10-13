/**
 * Firestore security rules tests.  Run:  npm run test:rules
 * (needs Java; downloads the Firestore emulator on first run)
 */
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from '@firebase/rules-unit-testing';
import {
  doc, getDoc, getDocs, setDoc, updateDoc, collection, writeBatch,
  serverTimestamp, arrayUnion, query, where,
} from 'firebase/firestore';

let env;
const HOST = 'host-uid', ALICE = 'alice-uid', MALLORY = 'mallory-uid';
const db = (uid) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore();

async function createSweep(uid = HOST, id = 's1', code = 'ABC123', extra = {}) {
  const d = db(uid);
  const b = writeBatch(d);
  b.set(doc(d, 'sweeps', id), {
    name: 'Office', race: 'Melbourne Cup 2026', entryFee: '$10', maxEntries: 24, maxEntriesPerPerson: 1,
    joinCode: code, creatorId: uid, status: 'open', createdAt: serverTimestamp(), participantIds: [],
    cup: true, tabDate: '2026-11-03', tabRaceType: 'R', ...extra,
  });
  b.set(doc(d, 'joinCodes', code), { sweepId: id, creatorId: uid });
  return b.commit();
}

async function join(uid, sweepId = 's1', email) {
  const d = db(uid);
  const entryRef = doc(collection(d, 'sweeps', sweepId, 'entries'));
  const b = writeBatch(d);
  b.set(entryRef, { userId: uid, displayName: 'Al', horseId: null, horseName: null, joinedAt: serverTimestamp() });
  if (email) b.set(doc(d, 'sweeps', sweepId, 'private', entryRef.id), { userId: uid, email });
  b.update(doc(d, 'sweeps', sweepId), { participantIds: arrayUnion(uid) });
  await b.commit();
  return entryRef.id;
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'sweep-rules-test',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
});
after(() => env.cleanup());
beforeEach(() => env.clearFirestore());

test('signed-in user can create a sweep with its join code', async () => {
  await assertSucceeds(createSweep());
});
test('cannot create a sweep as someone else', async () => {
  await assertFails(createSweep(MALLORY, 's1', 'ABC123', { creatorId: HOST }));
});
test('signed-out users cannot create', async () => {
  const d = db(null);
  await assertFails(setDoc(doc(d, 'sweeps', 'x'), { name: 'x' }));
});
test('sweep without a registered join code is rejected', async () => {
  const d = db(HOST);
  await assertFails(setDoc(doc(d, 'sweeps', 's2'), {
    name: 'O', race: 'R', maxEntries: 24, maxEntriesPerPerson: 1, joinCode: 'ZZZ999',
    creatorId: HOST, status: 'open', createdAt: serverTimestamp(), participantIds: [],
  }));
});
test('sweeps can be read by ID but never listed or searched', async () => {
  await createSweep();
  await assertSucceeds(getDoc(doc(db(null), 'sweeps', 's1')));
  await assertFails(getDocs(collection(db(null), 'sweeps')));
  await assertFails(getDocs(query(collection(db(ALICE), 'sweeps'), where('joinCode', '==', 'ABC123'))));
});
test('join codes resolve by exact code only', async () => {
  await createSweep();
  await assertSucceeds(getDoc(doc(db(ALICE), 'joinCodes', 'ABC123')));
  await assertFails(getDocs(collection(db(ALICE), 'joinCodes')));
});
test('join code cannot be hijacked', async () => {
  await createSweep();
  await assertFails(setDoc(doc(db(MALLORY), 'joinCodes', 'ABC123'), { sweepId: 'evil', creatorId: MALLORY }));
});
test('anyone signed in can join an open sweep; emails are write-only', async () => {
  await createSweep();
  const entryId = await join(ALICE, 's1', 'alice@example.com');
  await assertFails(getDoc(doc(db(ALICE), 'sweeps', 's1', 'private', entryId)));
  await assertFails(getDocs(collection(db(HOST), 'sweeps', 's1', 'private')));
});
test('cannot join as someone else or pre-assign a horse', async () => {
  await createSweep();
  const d = db(MALLORY);
  const b = writeBatch(d);
  b.set(doc(collection(d, 'sweeps', 's1', 'entries')), { userId: ALICE, displayName: 'x', horseId: null, horseName: null, joinedAt: serverTimestamp() });
  b.update(doc(d, 'sweeps', 's1'), { participantIds: arrayUnion(MALLORY) });
  await assertFails(b.commit());
  const b2 = writeBatch(d);
  b2.set(doc(collection(d, 'sweeps', 's1', 'entries')), { userId: MALLORY, displayName: 'x', horseId: 1, horseName: 'Fav', joinedAt: serverTimestamp() });
  b2.update(doc(d, 'sweeps', 's1'), { participantIds: arrayUnion(MALLORY) });
  await assertFails(b2.commit());
});
test('non-host cannot draw, change status, or rename the sweep', async () => {
  await createSweep();
  const entryId = await join(ALICE);
  await assertFails(updateDoc(doc(db(ALICE), 'sweeps', 's1'), { status: 'drawn' }));
  await assertFails(updateDoc(doc(db(ALICE), 'sweeps', 's1'), { name: 'pwned' }));
  await assertFails(updateDoc(doc(db(ALICE), 'sweeps', 's1', 'entries', entryId), { horseId: 1, horseName: '1. Fav' }));
  await assertFails(updateDoc(doc(db(MALLORY), 'sweeps', 's1'), { participantIds: [ALICE, MALLORY, HOST] }));
});
test('host can draw and move to race day', async () => {
  await createSweep();
  const entryId = await join(ALICE);
  const d = db(HOST);
  const b = writeBatch(d);
  b.update(doc(d, 'sweeps', 's1', 'entries', entryId), { horseId: 7, horseName: 'No. 7' });
  b.update(doc(d, 'sweeps', 's1'), { status: 'drawn', drawnAt: serverTimestamp() });
  await assertSucceeds(b.commit());
  await assertSucceeds(updateDoc(doc(d, 'sweeps', 's1', 'entries', entryId), { horseId: 9, horseName: '9. Spare', redrawnFrom: 7 }));
  await assertSucceeds(updateDoc(doc(d, 'sweeps', 's1'), { status: 'racing' }));
  await assertFails(updateDoc(doc(d, 'sweeps', 's1'), { status: 'open' }));
});
test('participant records result once; outsiders cannot', async () => {
  await createSweep();
  await join(ALICE);
  await updateDoc(doc(db(HOST), 'sweeps', 's1'), { status: 'drawn' });
  await updateDoc(doc(db(HOST), 'sweeps', 's1'), { status: 'racing' });
  const result = { firstHorseId: 7, firstHorseName: '7. Fav', secondHorseId: null, secondHorseName: null, thirdHorseId: null, thirdHorseName: null, autoRecorded: true, recordedAt: serverTimestamp() };
  await assertFails(setDoc(doc(db(MALLORY), 'sweeps', 's1', 'results', 'final'), result));
  await assertSucceeds(setDoc(doc(db(ALICE), 'sweeps', 's1', 'results', 'final'), result));
  await assertFails(setDoc(doc(db(HOST), 'sweeps', 's1', 'results', 'final'), result));
  await assertSucceeds(updateDoc(doc(db(ALICE), 'sweeps', 's1'), { status: 'completed' }));
});
