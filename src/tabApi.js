/**
 * TAB API wrapper — all calls go through /api/races, a CDN-cached server
 * endpoint that talks to TAB via an Australian-IP proxy (TAB geo-blocks
 * datacenter egress, including Vercel's).
 *
 * Race types: R = thoroughbred/gallops, H = harness, G = greyhound
 * Jurisdiction: QLD
 *
 * Race status values: Open, Closed, Paying, Interim, Resulted, Abandoned
 *
 * Results format: results[[Int]] — outer index = finishing position (0-indexed),
 * inner array handles dead heats. results[0][0] is winner's runner number.
 */

// All race data comes from /api/races — a CDN-cached server endpoint. The
// browser never talks to TAB or the proxy tunnel directly, so TAB sees ~one
// request per race per cache window no matter how many people are watching.
// Changing the proxy is a server-side env var now, not a client rebuild.
const RACES_ENDPOINT = '/api/races';

async function racesFetch(params) {
  const url = `${RACES_ENDPOINT}?${new URLSearchParams(params)}`;
  const res = await fetch(url);
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).detail || ''; } catch { /* non-JSON error body */ }
    throw new Error(`Race data unavailable (${res.status})${detail ? `: ${detail}` : ''}`);
  }
  return res.json();
}

/**
 * Returns today's date as yyyy-MM-dd (local time, AEST-aware via browser).
 */
export function todayDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Fetches all AU meetings for a given date, all race types (R/H/G).
 * Returns array of { meetingName, venueMnemonic, raceType, location, races[] }
 * where races[] = [{ raceNumber, raceName, raceStartTime, raceStatus }]
 */
async function fetchMeetingsForDate(date) {
  const FINISHED = new Set(['Paying', 'Interim', 'Resulted', 'Abandoned', 'Closed']);
  const AU_STATES = new Set(['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA']);
  const now = Date.now();
  const data = await racesFetch({ date });
  const meetings = data.meetings || [];
  return meetings
    .filter(m => AU_STATES.has(m.location))
    .map(m => ({
      meetingName: m.meetingName,
      venueMnemonic: m.venueMnemonic,
      raceType: m.raceType,
      location: m.location,
      date,
      races: (m.races || [])
        .filter(r => {
          if (FINISHED.has(r.raceStatus)) return false;
          if (!r.raceStartTime) return true;
          return new Date(r.raceStartTime).getTime() - now > 15 * 60 * 1000;
        })
        .map(r => ({
          raceNumber: r.raceNumber,
          raceName: r.raceName || `Race ${r.raceNumber}`,
          raceStartTime: r.raceStartTime,
          raceStatus: r.raceStatus,
          raceDistance: r.raceDistance ?? null,
        })),
    }));
}

/**
 * Fetches today's and tomorrow's Australian meetings (all race types: R/H/G) with open races.
 * Returns array of { meetingName, venueMnemonic, raceType, location, date, races[], dateLabel }
 */
export async function fetchTodaysMeetings() {
  const today = todayDate();
  const tomorrow = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  })();
  const [todayMeetings, tomorrowMeetings] = await Promise.all([
    fetchMeetingsForDate(today),
    fetchMeetingsForDate(tomorrow),
  ]);
  const withLabel = (meetings, label) =>
    meetings
      .filter(m => m.races.length > 0)
      .map(m => ({ ...m, dateLabel: label }));
  return [
    ...withLabel(todayMeetings, 'Today'),
    ...withLabel(tomorrowMeetings, 'Tomorrow'),
  ];
}

/**
 * Fetches full race detail including runners and results.
 * Returns { raceStatus, raceName, raceStartTime, runners[], results[][] }
 *
 * runners[] items: { runnerNumber, runnerName, barrierNumber, scratched }
 * results[][]: outer index = finish position (0-based), inner = runner numbers (dead heats)
 */
export async function fetchRaceDetail(date, raceType, venueMnemonic, raceNumber) {
  const data = await racesFetch({ date, type: raceType, venue: venueMnemonic, race: raceNumber });
  const race = data.race || data;

  // Full field incl. scratchings — needed to tell people their horse was scratched.
  const field = (race.runners || [])
    .filter(r => !r.vacantBox && !r.emergency)
    .map(r => ({
      runnerNumber: r.runnerNumber,
      runnerName: r.runnerName,
      barrierNumber: r.barrierNumber,
      scratched: !!r.scratched,
    }));

  return {
    raceStatus: race.raceStatus,
    raceName: race.raceName || `Race ${raceNumber}`,
    raceStartTime: race.raceStartTime,
    runners: field.filter(r => !r.scratched),
    field,
    results: race.results || [],
  };
}

// ── Melbourne Cup ────────────────────────────────────────────────────────────
// Cup sweeps are created weeks before TAB publishes the field, so they can't
// store a venue/race number up front. They carry `cup: true` and the race is
// looked up by name on the day's Flemington card once TAB lists it (the final
// field is declared Sat 31 Oct; the meeting appears around then).

export const CUP = {
  date: '2026-11-03',
  raceType: 'R',
  startIso: '2026-11-03T15:00:00+11:00',
  label: 'Melbourne Cup 2026 — Flemington, Tue 3 Nov',
  fieldSize: 24,
};

let cupLookup = null; // { at, promise }

export function findCupRace() {
  // Cache hits for 5 min; a miss (field not yet published) is retried sooner.
  if (cupLookup && Date.now() - cupLookup.at < 5 * 60 * 1000) return cupLookup.promise;
  const promise = racesFetch({ date: CUP.date })
    .then(data => {
      const meeting = (data.meetings || []).find(
        m => m.raceType === CUP.raceType && /flemington/i.test(m.meetingName || '')
      );
      if (!meeting) return null;
      const races = meeting.races || [];
      const race = races.find(r => /melbourne cup/i.test(r.raceName || ''))
        || races.find(r => r.raceNumber === 7); // Cup is Flemington R7 in 2026
      if (!race) return null;
      return { date: CUP.date, raceType: CUP.raceType, venueMnemonic: meeting.venueMnemonic, raceNumber: race.raceNumber };
    })
    .catch(() => null);
  cupLookup = { at: Date.now(), promise };
  promise.then(ref => { if (!ref && cupLookup?.promise === promise) cupLookup.at = Date.now() - 4 * 60 * 1000; });
  return promise;
}

/** True when the sweep follows a live TAB race (picked race, or the Cup preset). */
export function isTabLinked(sweep) {
  return !!(sweep && (sweep.tabVenueMnemonic || sweep.cup));
}

/**
 * Race detail for a sweep, or null when its race isn't on TAB yet
 * (a Cup sweep before the field is published).
 */
export async function fetchSweepRace(sweep) {
  let ref = null;
  if (sweep.tabVenueMnemonic) {
    ref = { date: sweep.tabDate, raceType: sweep.tabRaceType, venueMnemonic: sweep.tabVenueMnemonic, raceNumber: sweep.tabRaceNumber };
  } else if (sweep.cup) {
    ref = await findCupRace();
  }
  if (!ref) return null;
  return fetchRaceDetail(ref.date, ref.raceType, ref.venueMnemonic, ref.raceNumber);
}

/** Generic numbered horses (1..n) for manual sweeps and pre-field Cup draws. */
export function numberedHorses(n) {
  return Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `No. ${i + 1}` }));
}

/**
 * Lightweight poll — fetches only what's needed to check race status.
 * Returns raceStatus string.
 */
export async function fetchRaceStatus(date, raceType, venueMnemonic, raceNumber) {
  const detail = await fetchRaceDetail(date, raceType, venueMnemonic, raceNumber);
  return detail.raceStatus;
}

/**
 * Given a race detail object and a 0-based finishing position,
 * returns the runner number of the finisher (handles dead heats by taking [0]).
 */
export function getFinisherRunnerNumber(raceDetail, position) {
  if (!raceDetail.results || !raceDetail.results[position]) return null;
  return raceDetail.results[position][0] ?? null;
}

/**
 * Maps runner number → runner name from a runners array.
 */
export function runnerByNumber(runners, runnerNumber) {
  return runners.find(r => r.runnerNumber === runnerNumber) || null;
}
