/**
 * Cached TAB race data — the fan-out layer.
 *
 * Browsers call THIS, never TAB and never the tunnel directly. Vercel's CDN
 * caches each response, so TAB sees roughly one request per race per cache
 * window regardless of whether 10 or 100,000 people are watching. Load scales
 * with races, not users — which is what makes race day survivable on free tiers.
 *
 * It also means the tunnel URL is now a server-side runtime concern only.
 * Changing it no longer requires rebuilding the client bundle; set
 * TAB_PROXY_URL in the Vercel dashboard and it takes effect immediately.
 *
 * Routes (named function — Vercel does not deploy [...path].js catch-alls here):
 *   /api/races?date=2026-11-03
 *     → meetings for that date
 *   /api/races?date=2026-11-03&type=R&venue=FLE&race=7
 *     → full race detail incl. runners and results
 */

import { tabBase } from './_tunnel.js';

const JURISDICTION = 'QLD';

// Meetings barely change; race detail changes fast once a race is near/running.
const MEETINGS_CACHE = 'public, s-maxage=300, stale-while-revalidate=900';
const RACE_CACHE = 'public, s-maxage=20, stale-while-revalidate=60';

async function tabFetch(path) {
  const url = `${tabBase()}${path}${path.includes('?') ? '&' : '?'}jurisdiction=${JURISDICTION}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      'Accept': 'application/json, text/plain, */*',
      'Origin': 'https://www.tab.com.au',
      'Referer': 'https://www.tab.com.au/',
    },
  });
  if (!res.ok) throw new Error(`TAB ${res.status} for ${path}`);

  // A geo-block or interstitial comes back as HTML with a 200, so verify shape.
  const text = await res.text();
  if (!text.trimStart().startsWith('{')) {
    throw new Error('TAB returned non-JSON (likely geo-blocked — check the proxy)');
  }
  return JSON.parse(text);
}

export default async function handler(req, res) {
  const { date, type, venue, race } = req.query;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date required as yyyy-mm-dd' });
  }

  try {
    const isRaceDetail = type && venue && race;
    const data = isRaceDetail
      ? await tabFetch(`/racing/dates/${date}/meetings/${type}/${venue}/races/${race}`)
      : await tabFetch(`/racing/dates/${date}/meetings`);

    res.setHeader('Cache-Control', isRaceDetail ? RACE_CACHE : MEETINGS_CACHE);
    return res.status(200).json(data);
  } catch (err) {
    // Don't cache failures — otherwise a blip poisons the CDN for everyone.
    res.setHeader('Cache-Control', 'no-store');
    console.error('races endpoint failed:', err.message);
    return res.status(502).json({ error: 'upstream unavailable', detail: err.message });
  }
}
