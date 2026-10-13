# Infrastructure & launch runbook

Everything that has to exist outside the repo for Sweep to run, in the order to do it.

---

## 0. Security — do these first

| # | Step | Command / where |
|---|------|-----------------|
| 1 | **Deploy Firestore rules.** Until this is done, the whole database (every sweep and every participant's email) is publicly readable and probably writable. | `npm run deploy:rules` (logs in to Firebase on first run). Optional first: `npm run test:rules` (needs Java). |
| 2 | **Enable Anonymous sign-in** if it isn't already. The rules require it. | Firebase console → Authentication → Sign-in method → Anonymous → Enable |
| 3 | **Set `CRON_SECRET`** (32+ random characters). The result checker refuses to run without it. | Vercel → Settings → Environment Variables. Generate with `openssl rand -hex 32` |
| 4 | **Run the one-off migration.** It moves old participant emails off the public entry docs and registers join codes for older sweeps. | `curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://sweep-web-nine.vercel.app/api/cron/migrate` and then delete `api/cron/migrate.js` |
| 5 | **Rotate the GitHub token** embedded in the local git remote URL (`git remote -v` shows it). | GitHub → Settings → Developer settings → revoke it. Then `gh auth login` and `git remote set-url origin https://github.com/bgm2fz2bps-dev/sweep-web.git` |

Order matters for 1 and the code deploy: **deploy the new code first, then the rules.** The new client is compatible with the old (open) rules, but the old client isn't compatible with the new rules.

Note: sweeps created before this change used a different identity scheme, so their hosts lose host controls (draw, race day). Fine for test sweeps; real users start fresh.

---

## 1. Sydney proxy box (replaces the laptop tunnel)

TAB geo-blocks datacenter egress, including Vercel `syd1`, so every TAB call exits through `proxy-server.js` on an Australian IP. Right now that's a Cloudflare quick tunnel to the Mac: the URL changes on restart, it dies when the Mac sleeps, and there's no redundancy.

**Host:** any Sydney VPS, about $6/month (Vultr, DigitalOcean, Binary Lane). Ubuntu 24.04, smallest size. Oracle Always Free (ap-sydney-1) costs $0 if capacity is available.

```bash
scp proxy-server.js scripts/proxy-box/setup.sh root@<box-ip>:/root/
ssh root@<box-ip> 'bash /root/setup.sh'
```

The script installs Node and Caddy (automatic HTTPS; with no domain it uses `<ip>.sslip.io`). It runs the proxy as a locked-down systemd service, firewalls everything except 22/80/443, and installs the five-minute result-checker cron. At the end it prints two values to paste into Vercel:

```
TAB_PROXY_URL=https://…
PROXY_TOKEN=…            # proxy rejects requests without it
```

Both are read at **runtime**, so changing them needs a redeploy but no code change. Once the box is verified:
- stop the laptop tunnel (`scripts/start-proxy.sh`) and its launch agent
- delete `scripts/start-proxy.sh` and `api/_tunnel-url.js`, and remove the fallback import in `api/_tunnel.js`

**Proxy hardening (in `proxy-server.js`):** a path allowlist (only the two racing endpoints), the `X-Proxy-Token` check, no CORS, cookies stripped, redirects restricted to TAB's host, and a global rate cap (`PROXY_MAX_PER_MINUTE`, default 600) so a bug can't get the IP banned.

---

## 2. Firestore → Blaze, with a budget alert

Spark's 50k reads/day runs out in minutes on race day. Blaze is pay-as-you-go (about US$0.06 per 100k reads). Firebase console → Usage and billing → Modify plan → Blaze. **Set a budget alert**, because Blaze has no automatic spend cap.

## 3. Vercel plan

The site is free and ad-free, so Hobby's non-commercial rule is fine. Hobby limits that matter on race day: 1M function invocations per month, 100 GB transfer, and 10s function duration. `/api/races` is CDN-cached, so function invocations scale with races, not users. Consider Pro for Cup week anyway.

## 4. Domain & SEO

- Canonical URLs, the sitemap and OG tags use `SITE_URL`, falling back to Vercel's production domain. **Adding a custom domain in Vercel updates them on the next build automatically.** Then set the `.vercel.app` URL to redirect to the new domain (Vercel → Domains).
- **Google Search Console:** add the site (domain property), submit `/sitemap.xml`, and request indexing for the five pages. Do this as early as possible.
- The static pages are written in `site/pages.mjs` and rendered by `scripts/build-pages.mjs` at build. Update `UPDATED` when you edit the content.

---

## How the pieces fit

```
browser ──► Vercel CDN ──► static pages (/, /melbourne-cup-sweep-*, …)
        │               └► app.html (SPA: /create, /sweep/:id, /join/:code, /my-sweeps)
        ├──► /api/races (CDN-cached: 20s race, 5 min meetings) ──► Sydney proxy ──► TAB
        └──► Firestore (anonymous auth + firestore.rules)

Sydney box cron (5 min) ──► /api/cron/check-results ──► proxy ──► TAB
                                                  └──► Firestore (admin) + Resend emails
```

### Environment variables (Vercel)

| Name | Purpose |
|---|---|
| `TAB_PROXY_URL` | Sydney proxy origin |
| `PROXY_TOKEN` | shared secret with the proxy |
| `CRON_SECRET` | protects `/api/cron/*` (required) |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | admin access for the cron |
| `RESEND_API_KEY` | result emails (optional) |
| `SITE_URL` | canonical origin override (optional) |

### Gotchas learned the hard way
- Vercel Hobby rejects crons more frequent than daily, and the rejection is **silent**: no deployment appears at all. This cost five months of undeployed commits (Apr → Sep 2026). Keep `crons` out of `vercel.json`.
- Vercel doesn't deploy `api/**/[...path].js` catch-all routes on this project. Add endpoints as named files.
- TAB returns an HTML interstitial with status **200** when it geo-blocks you. `api/races.js` checks that the body is JSON.
