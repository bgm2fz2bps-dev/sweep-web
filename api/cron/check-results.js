/**
 * Vercel Cron — runs every 5 minutes.
 * Checks all sweeps in 'racing' status, polls TAB for results,
 * saves them to Firestore, and emails participants.
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const RESULTED_STATUSES = new Set(['Resulted', 'Paying']);
const TAB_BASE = 'https://api.beta.tab.com.au/v1/tab-info-service';
const JURISDICTION = 'QLD';
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const APP_URL = process.env.VITE_APP_URL || 'https://sweep-web-nine.vercel.app';

// ── Firebase Admin init (singleton) ──────────────────────────────────────────

function getDb() {
  if (!getApps().length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    initializeApp({ credential: cert(serviceAccount) });
  }
  return getFirestore();
}

// ── TAB API ───────────────────────────────────────────────────────────────────

async function tabFetch(path) {
  const url = `${TAB_BASE}${path}${path.includes('?') ? '&' : '?'}jurisdiction=${JURISDICTION}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      'Origin': 'https://www.tab.com.au',
      'Referer': 'https://www.tab.com.au/',
    },
  });
  if (!res.ok) throw new Error(`TAB ${res.status}: ${url}`);
  return res.json();
}

async function fetchRaceDetail(sweep) {
  const { tabDate, tabRaceType, tabVenueMnemonic, tabRaceNumber } = sweep;
  const data = await tabFetch(
    `/racing/dates/${tabDate}/meetings/${tabRaceType}/${tabVenueMnemonic}/races/${tabRaceNumber}`
  );
  const race = data.race || data;
  const runners = (race.runners || [])
    .filter(r => !r.vacantBox && !r.emergency && !r.scratched)
    .map(r => ({ runnerNumber: r.runnerNumber, runnerName: r.runnerName }));
  return {
    raceStatus: race.raceStatus,
    runners,
    results: race.results || [],
  };
}

function getFinisherRunnerNumber(detail, position) {
  if (!detail.results || !detail.results[position]) return null;
  return detail.results[position][0] ?? null;
}

function runnerByNumber(runners, num) {
  return runners.find(r => r.runnerNumber === num) || null;
}

// ── Email ─────────────────────────────────────────────────────────────────────

async function sendResultEmail({ to, sweepName, race, sweepId, placements }) {
  if (!RESEND_API_KEY) return;

  const sweepUrl = `${APP_URL}/sweep/${sweepId}`;

  const placingLines = placements
    .map(p => `<tr>
      <td style="padding:6px 12px;font-weight:700;color:#FFD700;">${p.medal}</td>
      <td style="padding:6px 12px;color:#fff;">${p.horseName}</td>
      <td style="padding:6px 12px;color:#ccc;">${p.personName || '—'}</td>
    </tr>`)
    .join('');

  const html = `
    <div style="background:#0A0E1A;padding:32px;font-family:sans-serif;color:#fff;border-radius:8px;max-width:480px;margin:auto;">
      <h1 style="color:#FFD700;margin:0 0 4px">🏆 Results are in!</h1>
      <p style="color:#aaa;margin:0 0 24px">${sweepName} · ${race}</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <thead>
          <tr style="border-bottom:1px solid #333;">
            <th style="padding:6px 12px;text-align:left;color:#aaa;font-weight:500">Place</th>
            <th style="padding:6px 12px;text-align:left;color:#aaa;font-weight:500">Horse</th>
            <th style="padding:6px 12px;text-align:left;color:#aaa;font-weight:500">Owner</th>
          </tr>
        </thead>
        <tbody>${placingLines}</tbody>
      </table>
      <a href="${sweepUrl}" style="display:inline-block;background:#FFD700;color:#000;font-weight:700;padding:12px 24px;border-radius:6px;text-decoration:none;">
        View Full Results →
      </a>
    </div>
  `;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Sweep <results@sweep.ripper.au>',
      to: [to],
      subject: `🏆 Results: ${sweepName}`,
      html,
    }),
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // Vercel cron sends this header; reject everything else in production
  const authHeader = req.headers['authorization'];
  if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const db = getDb();

  // Fetch all sweeps currently in 'racing' status
  const racingSnap = await db.collection('sweeps').where('status', '==', 'racing').get();
  if (racingSnap.empty) return res.json({ checked: 0 });

  const results = await Promise.allSettled(
    racingSnap.docs.map(async (sweepDoc) => {
      const sweep = sweepDoc.data();
      const sweepId = sweepDoc.id;

      if (!sweep.tabVenueMnemonic || !sweep.tabRaceNumber || !sweep.tabDate || !sweep.tabRaceType) {
        return { sweepId, skipped: 'no TAB fields' };
      }

      const detail = await fetchRaceDetail(sweep);
      if (!RESULTED_STATUSES.has(detail.raceStatus)) {
        return { sweepId, status: detail.raceStatus, action: 'waiting' };
      }

      // Already saved? (guard against duplicate cron runs)
      const existingResults = await db.collection('sweeps').doc(sweepId).collection('results').limit(1).get();
      if (!existingResults.empty) {
        return { sweepId, action: 'already saved' };
      }

      // Extract placings
      const winnerNum = getFinisherRunnerNumber(detail, 0);
      const secondNum = getFinisherRunnerNumber(detail, 1);
      const thirdNum = getFinisherRunnerNumber(detail, 2);
      const winnerRunner = runnerByNumber(detail.runners, winnerNum);
      const secondRunner = runnerByNumber(detail.runners, secondNum);
      const thirdRunner = runnerByNumber(detail.runners, thirdNum);

      const firstName = winnerRunner ? `${winnerRunner.runnerNumber}. ${winnerRunner.runnerName}` : (winnerNum ? String(winnerNum) : null);
      const secondName = secondRunner ? `${secondRunner.runnerNumber}. ${secondRunner.runnerName}` : (secondNum ? String(secondNum) : null);
      const thirdName = thirdRunner ? `${thirdRunner.runnerNumber}. ${thirdRunner.runnerName}` : (thirdNum ? String(thirdNum) : null);

      // Save results to Firestore
      await db.collection('sweeps').doc(sweepId).collection('results').add({
        firstHorseId: winnerNum ?? null,
        firstHorseName: firstName,
        secondHorseId: secondNum ?? null,
        secondHorseName: secondName,
        thirdHorseId: thirdNum ?? null,
        thirdHorseName: thirdName,
        autoRecorded: true,
        recordedAt: FieldValue.serverTimestamp(),
      });
      await db.collection('sweeps').doc(sweepId).update({ status: 'completed' });

      // Fetch entries for email notifications
      const entriesSnap = await db.collection('sweeps').doc(sweepId).collection('entries').get();
      const entries = entriesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Map horse ID → entry holder name (for placing display)
      const entryByHorseId = {};
      entries.forEach(e => { if (e.horseId != null) entryByHorseId[e.horseId] = e; });

      const placements = [
        { medal: '🥇 1st', horseName: firstName || '?', personName: entryByHorseId[winnerNum]?.displayName },
        { medal: '🥈 2nd', horseName: secondName || '?', personName: entryByHorseId[secondNum]?.displayName },
        { medal: '🥉 3rd', horseName: thirdName || '?', personName: entryByHorseId[thirdNum]?.displayName },
      ].filter(p => p.horseName !== '?');

      // Send email to each entry that has one
      const emailsSent = [];
      const seen = new Set();
      for (const entry of entries) {
        if (!entry.email || seen.has(entry.email)) continue;
        seen.add(entry.email);
        try {
          await sendResultEmail({
            to: entry.email,
            sweepName: sweep.name,
            race: sweep.race,
            sweepId,
            placements,
          });
          emailsSent.push(entry.email);
        } catch (err) {
          console.error(`Email failed for ${entry.email}:`, err.message);
        }
      }

      return { sweepId, action: 'resulted', emailsSent };
    })
  );

  const summary = results.map(r => r.status === 'fulfilled' ? r.value : { error: r.reason?.message });
  return res.json({ checked: racingSnap.size, summary });
}
