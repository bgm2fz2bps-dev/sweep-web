/**
 * Result checker — checks all sweeps in 'racing' status, polls TAB for results,
 * saves them to Firestore, and emails participants.
 *
 * NOT scheduled by Vercel. Hobby plans only allow once-daily crons, and a
 * five-minute expression makes the whole deployment fail validation — silently,
 * the deploy never appears in the dashboard at all. So the `crons` block was
 * removed from vercel.json and this endpoint is invoked externally instead,
 * from the same Australian box that runs the TAB proxy, via a crontab line
 * scheduled every five minutes:
 *
 *   curl -fsS -X POST \
 *     -H "Authorization: Bearer $CRON_SECRET" \
 *     https://sweep-web-nine.vercel.app/api/cron/check-results
 *
 * Set CRON_SECRET in the Vercel dashboard and match it on the caller.
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { tabBase, proxyHeaders } from '../_tunnel.js';

const RESULTED_STATUSES = new Set(['Resulted', 'Paying']);
// TAB blocks Vercel's datacenter egress, so results must be fetched through the
// same Australian-IP proxy the frontend uses — not api.beta.tab.com.au direct.
const CUP = { date: '2026-11-03', raceType: 'R' };
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
  const url = `${tabBase()}${path}${path.includes('?') ? '&' : '?'}jurisdiction=${JURISDICTION}`;
  const res = await fetch(url, { headers: proxyHeaders() });
  if (!res.ok) throw new Error(`TAB ${res.status} for ${path}`);
  return res.json();
}

// Cup sweeps are created before TAB lists the race, so find it by name.
let cupRef;
async function resolveRace(sweep) {
  if (sweep.tabVenueMnemonic && sweep.tabRaceNumber && sweep.tabDate && sweep.tabRaceType) {
    return sweep;
  }
  if (!sweep.cup) return null;
  if (cupRef === undefined) {
    const data = await tabFetch(`/racing/dates/${CUP.date}/meetings`);
    const meeting = (data.meetings || []).find(m => m.raceType === CUP.raceType && /flemington/i.test(m.meetingName || ''));
    const race = meeting && ((meeting.races || []).find(r => /melbourne cup/i.test(r.raceName || ''))
      || (meeting.races || []).find(r => r.raceNumber === 7));
    cupRef = race
      ? { tabDate: CUP.date, tabRaceType: CUP.raceType, tabVenueMnemonic: meeting.venueMnemonic, tabRaceNumber: race.raceNumber }
      : null;
  }
  return cupRef;
}

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
      <td style="padding:6px 12px;font-weight:700;color:#FFD700;">${esc(p.medal)}</td>
      <td style="padding:6px 12px;color:#fff;">${esc(p.horseName)}</td>
      <td style="padding:6px 12px;color:#ccc;">${esc(p.personName || '—')}</td>
    </tr>`)
    .join('');

  const html = `
    <div style="background:#0A0E1A;padding:32px;font-family:sans-serif;color:#fff;border-radius:8px;max-width:480px;margin:auto;">
      <h1 style="color:#FFD700;margin:0 0 4px">🏆 Results are in!</h1>
      <p style="color:#aaa;margin:0 0 24px">${esc(sweepName)} · ${esc(race)}</p>
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
      <a href="${esc(sweepUrl)}" style="display:inline-block;background:#FFD700;color:#000;font-weight:700;padding:12px 24px;border-radius:6px;text-decoration:none;">
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
      subject: `🏆 Results: ${String(sweepName).replace(/[\r\n]/g, ' ').slice(0, 80)}`,
      html,
    }),
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // Fail closed: with no secret configured, nobody gets in (previously an
  // unset CRON_SECRET meant the header "Bearer undefined" was accepted).
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) {
    return res.status(503).json({ error: 'CRON_SECRET not configured' });
  }
  if (req.headers['authorization'] !== `Bearer ${secret}`) {
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

      const ref = await resolveRace(sweep);
      if (!ref) return { sweepId, skipped: 'no TAB race' };

      const detail = await fetchRaceDetail(ref);
      if (!RESULTED_STATUSES.has(detail.raceStatus)) {
        return { sweepId, status: detail.raceStatus, action: 'waiting' };
      }

      // Already saved by a browser or an earlier run?
      const resultsCol = db.collection('sweeps').doc(sweepId).collection('results');
      const existingResults = await resultsCol.limit(1).get();
      if (!existingResults.empty) {
        if (sweep.status !== 'completed') await db.collection('sweeps').doc(sweepId).update({ status: 'completed' });
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

      // Save results — same fixed doc ID browsers use, so only one write wins.
      try {
        await resultsCol.doc('final').create({
        firstHorseId: winnerNum ?? null,
        firstHorseName: firstName,
        secondHorseId: secondNum ?? null,
        secondHorseName: secondName,
        thirdHorseId: thirdNum ?? null,
        thirdHorseName: thirdName,
        autoRecorded: true,
        recordedAt: FieldValue.serverTimestamp(),
        });
      } catch (err) {
        if (err.code !== 6 /* ALREADY_EXISTS */) throw err;
      }
      await db.collection('sweeps').doc(sweepId).update({ status: 'completed' });

      // Fetch entries for email notifications
      const [entriesSnap, privateSnap] = await Promise.all([
        db.collection('sweeps').doc(sweepId).collection('entries').get(),
        db.collection('sweeps').doc(sweepId).collection('private').get(),
      ]);
      const emailByEntry = {};
      privateSnap.docs.forEach(d => { emailByEntry[d.id] = d.data().email; });
      const entries = entriesSnap.docs.map(d => ({
        id: d.id,
        ...d.data(),
        email: emailByEntry[d.id] || d.data().email, // legacy sweeps stored it on the entry
      }));

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
          emailsSent.push(entry.id);
        } catch (err) {
          console.error(`Email failed for ${entry.email}:`, err.message);
        }
      }

      return { sweepId, action: 'resulted', emailsSent: emailsSent.length };
    })
  );

  const summary = results.map(r => r.status === 'fulfilled' ? r.value : { error: r.reason?.message });
  return res.json({ checked: racingSnap.size, summary });
}
