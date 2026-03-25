# Sweep Web

A real-time racing sweep app for Australian horse racing. Create a sweep, share a join code with mates, draw horses randomly, and watch results come in automatically from the TAB API.

## Tech Stack

- **Frontend**: React 18 + Vite
- **Backend/DB**: Firebase Firestore (real-time sync)
- **Auth**: Firebase Anonymous Auth (session-scoped UUID via `sessionStorage`)
- **Routing**: React Router v6
- **TAB Data**: `api.beta.tab.com.au` (proxied through standalone Node proxy on port 5175)

## Dev Setup

```bash
npm install
npm run dev:all   # starts BOTH the TAB proxy (port 5175) AND Vite dev server (port 5174)
```

Or run them separately in two terminals:
```bash
npm run proxy   # TAB proxy on http://localhost:5175
npm run dev     # Vite on http://localhost:5174
```

> **Important:** The TAB proxy (`proxy-server.js`) must be running for TAB race linking to work. It spoofs iOS browser headers to get past the TAB API's geo/bot restrictions. The proxy itself must run on a machine with an Australian IP — it won't work from outside Australia.

### proxy-server.js
A standalone Node.js HTTP server (`proxy-server.js`) at the project root. Listens on port 5175, strips proxy-revealing headers, and forwards requests to `api.beta.tab.com.au` with spoofed iOS browser headers. Vite's built-in proxy was unable to fully override request headers, hence the separate process.

Frontend calls: `http://localhost:5175/tab/v1/tab-info-service/...`
Forwarded to: `https://api.beta.tab.com.au/v1/tab-info-service/...`

## Identity System

Each browser tab gets a stable UUID stored in `sessionStorage` (per-tab, cleared on close). Display names are stored in `localStorage` and shared across tabs on the same browser. No login required — all auth is Firebase Anonymous Auth under the hood.

## Firestore Data Model

```
sweeps/{sweepId}
  name, race, entryFee, maxEntries, joinCode
  creatorId, status, createdAt, participantIds[]
  drawnAt
  # TAB fields (optional — only if linked to a race):
  tabDate, tabRaceType, tabVenueMnemonic, tabRaceNumber, tabMeetingName

sweeps/{sweepId}/entries/{entryId}
  userId, displayName, horseId, horseName, joinedAt

sweeps/{sweepId}/results/{resultId}
  firstHorseId, firstHorseName
  secondHorseId, secondHorseName
  thirdHorseId, thirdHorseName
  autoRecorded, recordedAt
```

**Status flow**: `open` → `drawn` → `racing` → `completed`

## TAB API Integration

### Base URL (via Node proxy)
All frontend calls go to `http://localhost:5175/tab/v1/tab-info-service/...` which is forwarded to `https://api.beta.tab.com.au` by `proxy-server.js` with spoofed iOS/browser headers to avoid 403s.

### Endpoints

| Purpose | Path |
|---------|------|
| Today's meetings | `GET /racing/dates/{yyyy-MM-dd}/meetings?jurisdiction=QLD` |
| Race detail + runners | `GET /racing/dates/{date}/meetings/{raceType}/{venueMnemonic}/races/{raceNumber}?jurisdiction=QLD` |

### Race Types
- `R` — Thoroughbred / Gallops
- `H` — Harness
- `G` — Greyhound

### Race Status Values
`Open` | `Closed` | `Paying` | `Interim` | `Resulted` | `Abandoned`

### Results Format
`results: number[][]` — outer index = finishing position (0-based), inner array handles dead heats.
- Winner runner number: `results[0][0]`
- 2nd: `results[1][0]`
- 3rd: `results[2][0]`

### Runner Filtering
Exclude runners where `vacantBox === true`, `emergency === true`, or `scratched === true`.

### Wrapper: `src/tabApi.js`
- `fetchTodaysMeetings(date?)` — returns thoroughbred meetings only
- `fetchRaceDetail(date, raceType, venueMnemonic, raceNumber)` — returns `{ raceStatus, raceName, raceStartTime, runners[], results[][] }`
- `fetchRaceStatus(...)` — lightweight status-only check
- `getFinisherRunnerNumber(raceDetail, position)` — extracts runner number from results
- `runnerByNumber(runners, runnerNumber)` — lookup runner by number
- `todayDate()` — returns `yyyy-MM-dd` in local time

## How TAB-Linked Sweeps Work

1. **CreateSweep**: Toggle "Link to a TAB race today" → pick meeting → pick race → runners auto-load, race name and max entries auto-fill. TAB fields stored on sweep doc.

2. **Draw**: If `tabVenueMnemonic` is present, fetches live runner list from TAB at draw time. Horse names stored as `"1. Thunder (B3)"` format (runner number + barrier). Fisher-Yates shuffle, one runner per participant.

3. **Race Day polling**: `RaceDayView` polls TAB every 30 seconds. When status becomes `Resulted` or `Paying`, auto-saves results to Firestore and transitions to results view. Host can still enter results manually as a fallback.

4. **Results**: `autoRecorded: true` badge shown when results were auto-populated from TAB.

## End-to-End Test Results (2026-03-25)

Full flow tested and confirmed working:

1. ✅ **Create**: Ticked "Link to TAB race today" → 20 thoroughbred meetings loaded (Eagle Farm, Sandown, Randwick etc.) → Selected Eagle Farm Race 1 → 8 runners auto-loaded, max entries auto-set to 8, race status: Paying
2. ✅ **Join**: Second browser tab joined with independent sessionStorage identity, saw "Join this Sweep" button (not "You"), joined successfully
3. ✅ **Draw**: Host clicked "Start the Draw" → live runners fetched from TAB → Fisher-Yates shuffle → real horse names assigned (e.g. "1. IGOTMYMINDONYOU (B3)", "6. FROTHSAY (B5)")
4. ✅ **Auto-results**: On entering Race Day view, polling immediately detected race status "Paying", fetched official TAB results, saved to Firestore, transitioned to results view showing 🥇 4. REWRITE / 🥈 7. DESANTO / 🥉 5. ARISTOCRA... with "✅ Auto-recorded from TAB" badge

The proxy fix that made this work: added `'Accept-Encoding': 'identity'` to the proxy's outbound HTTPS headers so responses come back as plain JSON (not gzip), and pass through all original response headers to the browser.

## Production Deployment

The app has two parts to deploy: the **React frontend** and the **Node proxy server**.

### 1. Push to GitHub

```bash
cd /Users/geetass/Projects/sweep-web
rm .git/index.lock   # remove stale lock if present
git add -A
git commit -m "Initial commit — sweep-web horse racing sweepstake app"
gh repo create geetass/sweep-web --public --remote=origin --push --source=.
```

### 2. Deploy Proxy to Render

The proxy server must run in **Australia** (the TAB API is geo-restricted to AU IPs).

1. Go to [render.com](https://render.com) → New → Web Service
2. Connect your GitHub account → select `geetass/sweep-web`
3. Render will auto-detect `render.yaml` — it configures:
   - Build command: `echo "no build step required"`
   - Start command: `node proxy-server.js`
4. In Region, select **Singapore** or closest AU-region available (or use Railway Sydney / Fly.io Sydney)
5. Note the service URL (e.g. `https://sweep-proxy.onrender.com`)

> ⚠️ **Important**: Render's free tier in US/EU regions may not work because the TAB API is geo-restricted to Australian IPs. If requests fail, use a Sydney-region host like Railway or Fly.io.

### 3. Deploy Frontend to Vercel

1. Go to [vercel.com](https://vercel.com) → New Project → Import from GitHub → `geetass/sweep-web`
2. Vercel auto-detects Vite — no config changes needed (`vercel.json` is already committed)
3. Add environment variable:
   - Key: `VITE_PROXY_URL`
   - Value: your Render proxy URL (e.g. `https://sweep-proxy.onrender.com`)
4. Deploy → get your live URL (e.g. `https://sweep-web.vercel.app`)

### 4. Test

Visit your Vercel URL, create a sweep, tick "Link to TAB race today" — the dropdown should populate with today's races.

### Environment Variables

| Variable | Where | Value |
|----------|-------|-------|
| `VITE_PROXY_URL` | Vercel env vars | Your Render service URL |
| `PORT` | Set automatically by Render | Not needed to set manually |

See `.env.example` for reference.

---

## Known Issues / TODO

- [ ] TAB API is geo-restricted — only accessible from Australian IPs. `proxy-server.js` works in dev when running on an Australian machine. Production deploys need a server-side proxy or edge function hosted in Australia (e.g. Cloud Run, Railway, Fly.io in Sydney region).
- [ ] Polling runs in all browser tabs simultaneously — could replace with a Cloud Function triggered on race status change.
- [ ] `todayDate()` uses the browser's local timezone — users outside AEST may see the wrong date for late-night races.
- [ ] Results form for TAB sweeps shows horse names in `"N. Name (BX)"` format — could be improved to show just the name in the dropdown.
