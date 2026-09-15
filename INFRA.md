# Infrastructure Setup

What has to exist outside the repo for Sweep to run, and why.

---

## Why there's a proxy at all

TAB geo-blocks datacenter egress. Requests from Vercel — including its Sydney
`syd1` region — get an HTML interstitial rather than JSON. Confirmed by testing
`/api/tab/proxy` against a live deploy. So every TAB call must exit from an
Australian IP that isn't a known cloud range.

Right now that's a Cloudflare quick tunnel to `proxy-server.js` on George's Mac.
That's fine for testing and unacceptable for launch: the URL changes on every
restart, the machine sleeps, and there's no redundancy.

---

## 1. Move the proxy to a Sydney box

Any always-on host with an Australian IP works. Options, cheapest first:

| Option | Cost | Notes |
|---|---|---|
| Oracle Cloud Always Free (ap-sydney-1) | $0 | Free ARM tier halved to 2 OCPU/12GB in June 2026; Sydney capacity is often unavailable. Try first, don't count on it. |
| Vultr / DigitalOcean / Binary Lane Sydney | ~$5–6/mo | Reliable. Budget this as the realistic answer. |

### Setup on the box

```bash
git clone https://github.com/bgm2fz2bps-dev/sweep-web.git
cd sweep-web && npm install
node proxy-server.js          # listens on :5175, /health for uptime checks
```

Keep it alive with systemd or pm2. Put it behind a domain with TLS (Caddy makes
this one line) so you get a stable `https://` URL.

### Point Vercel at it

Set in the Vercel dashboard → Settings → Environment Variables:

```
TAB_PROXY_URL = https://your-proxy-domain
```

`api/_tunnel.js` prefers this over the baked-in tunnel constant, and it's read at
**runtime** — so changing the proxy needs no rebuild and no redeploy.

Once this is set and verified, delete `scripts/start-proxy.sh`, `api/_tunnel.js`'s
hardcoded constant, and the `VITE_PROXY_URL` line in `.env.production`. They only
exist to support the laptop tunnel.

### Move the result-checker cron here too

Vercel Hobby only permits once-daily crons, and a more frequent expression makes
the **entire deployment fail validation silently** — no build appears in the
dashboard at all. That cost this project five months of undeployed commits
(Apr 5 → Sep 15). The `crons` block is therefore gone from `vercel.json`.

Run it from this box's crontab every five minutes instead:

```
*/5 * * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://sweep-web-nine.vercel.app/api/cron/check-results
```

Set `CRON_SECRET` in Vercel env vars and match it here.

---

## 2. Firestore → Blaze

Do this before any public sharing. Spark's 50k reads/day is a hard cliff that
race-day traffic clears in minutes; Blaze is pay-as-you-go (~$0.06/100k reads),
so it costs approximately nothing at current volume but removes the ceiling.

Firebase Console → Usage and billing → Modify plan → Blaze.

**Set a budget alert** while you're there. Blaze has no automatic spend cap, and
an unexpected read pattern can run up a bill.

---

## 3. Caching (done — how it works)

`api/races.js` is the only thing that talks to the proxy. Browsers call it and
never touch TAB directly. Responses carry `s-maxage`, so Vercel's CDN absorbs the
fan-out: TAB sees roughly one request per race per cache window whether 10 or
100,000 people are watching.

- Meetings: `s-maxage=300`, stale-while-revalidate 900
- Race detail: `s-maxage=20`, stale-while-revalidate 60
- Errors are sent `no-store` so a blip can't poison the cache

Note that Vercel does **not** deploy `api/**/[...path].js` catch-all routes on
this project — verified against live deploys, they 404 while named functions like
`/api/debug` and `/api/races` work. Add new endpoints as named files.

---

## Pre-launch checklist

- [ ] Proxy on a Sydney box with a stable domain
- [ ] `TAB_PROXY_URL` set in Vercel
- [ ] `CRON_SECRET` set in Vercel and in the box's crontab
- [ ] Result-checker cron running every 5 min from the box
- [ ] Firestore on Blaze, with a budget alert
- [ ] Decide emails vs web push (Resend free is 100/day — nowhere near enough;
      see SCALING.md)
- [ ] Load-test the race-day view and check Firestore read counts per page load
