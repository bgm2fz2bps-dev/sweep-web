# Scaling Considerations

> Current stack is built for low-cost early usage. This doc tracks what needs upgrading
> before a high-traffic event (target: ~100k users on race day).

---

## Current limits by service

### Vercel (Hobby — free)
| Limit | Current | At scale |
|---|---|---|
| Serverless function invocations | 100k/month | Blown in hours on race day |
| Cron jobs | 1 job, max once/minute | Fine for now |
| Bandwidth | 100 GB/month | May hit on race day |
| Function duration | 10s max (Hobby) | Cron may timeout if many sweeps |
| **Upgrade to** | **Pro ($20/mo)** | Higher limits, 60s functions, more crons |

### Firebase Firestore (Spark — free)
| Limit | Current | At scale |
|---|---|---|
| Reads | 50k/day | ~5–10 reads per user page load → gone fast |
| Writes | 20k/day | Results + entry saves |
| Realtime listeners | Counted as reads per update | Every open browser tab counts |
| **Upgrade to** | **Blaze (pay-as-you-go)** | $0.06/100k reads — cheap but needs monitoring |

### Resend (Free)
| Limit | Current | At scale |
|---|---|---|
| Emails/month | 3,000 | Way under for 100k users |
| Emails/day | 100 | Blown immediately on race day |
| **Upgrade to** | **Pro ($20/mo = 50k emails)** or **Business ($90/mo = 100k)** | |

### TAB API Proxy (Cloudflare Quick Tunnel via your Mac)
| Issue | Current | At scale |
|---|---|---|
| Single machine | Your Mac must be on | Single point of failure |
| URL changes on restart | Requires redeploy to update | Unreliable |
| No redundancy | Mac goes to sleep = no data | |
| **Upgrade to** | **Named Cloudflare Tunnel with a domain** (free but needs domain) OR **A small VPS in AU** (e.g. Vultr Sydney ~$6/mo) | |

---

## Architecture changes needed at scale

### 1. Firestore listener fan-out
Currently every open browser tab holds a realtime `onSnapshot` listener per sweep.
On race day with thousands of people watching the same sweep, that's thousands of
listeners all getting the same update → massive read cost.

**Fix:** Switch race-day view to polling (e.g. refresh every 30s) instead of realtime
listeners, or use Firestore's built-in caching more aggressively.

### 2. Cron result-checker bottleneck
Currently one cron function fetches TAB + saves results + sends all emails sequentially.
With 1,000 active sweeps it will timeout.

**Fix:** Fan out — cron enqueues jobs (Vercel Queue or Cloud Tasks), workers process
one sweep each in parallel.

### 3. Email deliverability at volume
Bulk result emails all sent at once will trigger spam filters without proper
sending domain, DKIM, SPF, DMARC setup.

**Fix:** Set up a proper sending domain with DNS records in Resend before going live.

### 4. No rate limiting on join/create
Currently anyone can spam entries or create thousands of sweeps.

**Fix:** Add Vercel rate limiting (available on Pro) or a simple IP-based check
before high-traffic events.

---

## Priority order when scaling up

1. **Firestore → Blaze** (free until you hit limits, then pay-as-you-go) — do this before any public launch
2. **Vercel → Pro** — needed before race day for function timeout headroom
3. **TAB proxy → stable VPS or named tunnel** — needed for reliability
4. **Resend → Pro** — needed once more than ~50 sweeps exist on a race day
5. **Firestore listener → polling on race-day view** — needed at thousands of concurrent users
6. **Cron fan-out** — needed at hundreds of concurrent sweeps
