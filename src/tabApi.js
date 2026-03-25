/**
 * TAB API wrapper — all calls go through the Vite proxy at /api/tab
 * which rewrites to https://api.beta.tab.com.au with spoofed iOS headers.
 *
 * Race types: R = thoroughbred/gallops, H = harness, G = greyhound
 * Jurisdiction: QLD
 *
 * Race status values: Open, Closed, Paying, Interim, Resulted, Abandoned
 *
 * Results format: results[[Int]] — outer index = finishing position (0-indexed),
 * inner array handles dead heats. results[0][0] is winner's runner number.
 */

// In development: proxy runs at localhost:5175
// In production: set VITE_PROXY_URL to your deployed proxy URL (e.g. https://sweep-proxy.onrender.com)
const BASE = (import.meta.env.VITE_PROXY_URL || 'http://localhost:5175') + '/tab/v1/tab-info-service';
const JURISDICTION = 'QLD';

async function tabFetch(path) {
  const url = `${BASE}${path}${path.includes('?') ? '&' : '?'}jurisdiction=${JURISDICTION}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TAB API error ${res.status}: ${url}`);
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
 * Fetches all thoroughbred (raceType R) meetings for today.
 * Returns array of { meetingName, venueMnemonic, raceType, location, races[] }
 * where races[] = [{ raceNumber, raceName, raceStartTime, raceStatus }]
 */
export async function fetchTodaysMeetings(date) {
  const d = date || todayDate();
  const data = await tabFetch(`/racing/dates/${d}/meetings`);
  const meetings = data.meetings || [];
  return meetings
    .filter(m => m.raceType === 'R')
    .map(m => ({
      meetingName: m.meetingName,
      venueMnemonic: m.venueMnemonic,
      raceType: m.raceType,
      location: m.location,
      races: (m.races || []).map(r => ({
        raceNumber: r.raceNumber,
        raceName: r.raceName || `Race ${r.raceNumber}`,
        raceStartTime: r.raceStartTime,
        raceStatus: r.raceStatus,
      })),
    }));
}

/**
 * Fetches full race detail including runners and results.
 * Returns { raceStatus, raceName, raceStartTime, runners[], results[][] }
 *
 * runners[] items: { runnerNumber, runnerName, barrierNumber, scratched }
 * results[][]: outer index = finish position (0-based), inner = runner numbers (dead heats)
 */
export async function fetchRaceDetail(date, raceType, venueMnemonic, raceNumber) {
  const data = await tabFetch(`/racing/dates/${date}/meetings/${raceType}/${venueMnemonic}/races/${raceNumber}`);
  const race = data.race || data;

  const runners = (race.runners || [])
    .filter(r => !r.vacantBox && !r.emergency)
    .map(r => ({
      runnerNumber: r.runnerNumber,
      runnerName: r.runnerName,
      barrierNumber: r.barrierNumber,
      scratched: !!r.scratched,
    }))
    .filter(r => !r.scratched);

  return {
    raceStatus: race.raceStatus,
    raceName: race.raceName || `Race ${raceNumber}`,
    raceStartTime: race.raceStartTime,
    runners,
    results: race.results || [],
  };
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
