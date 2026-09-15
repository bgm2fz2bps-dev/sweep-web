# Sweep — Plan to Melbourne Cup 2026

**Target date: Tuesday 3 November 2026.** Written 15 September — roughly seven weeks out.

**Scope decision: free tool, no fees, no payment processing.** Monetisation is
out of scope this year (see "Why no fees" below). The goal is a genuinely good
sweep tool that people find via search during Cup week.

---

## Where things stand

Deploys work again. The site had been serving an April build for five months
because a `*/5` cron expression in `vercel.json` failed Vercel Hobby's validation
— and since that rejection happens *before* a deployment record is created,
nothing ever appeared in the dashboard, not even an error. Every push from 6 Apr
to 15 Sep was silently discarded.

Working as of today:

- Race picker loading live TAB meetings (Doomben, Caulfield Heath, Canterbury…)
- `/api/races` CDN cache — verified MISS 1962ms → HIT 17ms
- Per-person entry limits, race type picker, manual fallback
- Result-checker endpoint live (401 on unauthenticated, as intended)

Still laptop-dependent: TAB data flows through a Cloudflare quick tunnel to
George's Mac. That's the single biggest fragility.

---

## The SEO finding that shapes everything

Page one for "melbourne cup sweep" is Racenet, Punters, Wikipedia, the VGCCC —
and a bakery. **We will not outrank them on the head term in seven weeks**, and
shouldn't try.

But every incumbent is a *printable PDF*. Not one is a tool. And "People also
search for" surfaces:

- **melbourne cup sweep generator** ← our product, nobody ranking for it
- **melbourne cup sweep scratchings** ← our unique strength
- melbourne cup sweep tickets / poster / odds
- how does a melbourne cup sweep work

**Scratchings is the wedge.** A horse gets pulled the morning of the race and the
office sweep falls apart — a printout structurally cannot handle that, and the
app already does via the live TAB feed. That's a real advantage, not positioning.

Also worth knowing: Racenet and Punters only publish their printables once the
final field is announced. We can be live and indexed weeks earlier.

**Strategy: cede the head term, own "sweep generator" and "sweep scratchings",
use the printable chart as the link magnet.**

---

## Roadmap

### Now — week of 15 Sep (longest lead time, do first)

- [ ] Register `sweepchart.com.au` + `.com` + `.au` (ABN confirmed available).
      Verify at registrar — RDAP rate-limited during checks.
- [ ] Point domain at Vercel, set canonical URLs, redirect the `.vercel.app`
- [ ] Sydney proxy box + `TAB_PROXY_URL` — see INFRA.md
- [ ] Firestore → Blaze **with a budget alert** (no automatic spend cap)
- [ ] Move result-checker cron to the proxy box crontab

### Late September — make the site indexable

The app is a Vite SPA; Google gets an empty shell with a JS bundle. Nothing to
index. Needs static or prerendered pages before any content work matters.

- [ ] Static/prerendered route strategy (decide: static HTML in `public/` vs
      prerender plugin — prerender keeps one design system, adds build risk)
- [ ] Per-page title/meta/OG tags, `sitemap.xml`, `robots.txt`, canonicals
- [ ] Structured data (HowTo / FAQ) on guide pages

### October — content

- [ ] `/melbourne-cup-sweep-generator` — the money page, targets the open query
- [ ] `/melbourne-cup-sweep-scratchings` — our differentiator, explains what
      happens when a horse is scratched and how the app handles it
- [ ] `/melbourne-cup-sweep-chart` — printable. Blank numbered chart now so it
      indexes early; auto-fills from TAB once the field drops
- [ ] `/how-to-run-a-melbourne-cup-sweep` — guide incl. the legal rules
- [ ] Home page with real indexable content

### Late October — hardening

- [ ] Firestore read audit: if each 60s poll re-reads sweep + entries
      subcollection, 100k users = hundreds of millions of reads. Collapse live
      state into one aggregated doc per sweep (~25x reduction)
- [ ] Load test race-day view
- [ ] Barrier draw (~1 week out): confirm printable auto-fill works on real data
- [ ] Sharpen the invite loop — every creator invites 10–24 people, and that
      compounding loop will outperform any affordable ad spend

---

## Why no fees

Office sweeps are legal without a licence under a narrow exemption whose central
condition is that **organisers cannot keep any money for costs or administration
— all funds go back to participants as prizes.** Taking a cut of the pool is
precisely what that prohibits. It would make this a licensed gambling operation,
state by state (NSW, SA and ACT require permits even for ordinary sweeps), and
mainstream payment processors restrict gambling flows.

Not legal advice — would need a lawyer before going anywhere near it.

**If monetisation comes back on the table**, the clean route is charging the
*organiser* for the software (premium sweeps, branding, multiple races) rather
than touching the pool. That's a SaaS fee, not a rake — legally a different
animal. A single non-gambling event sponsor for Cup week would likely also beat
programmatic ads.

On ads: Google doesn't certify sites on third-party subdomains, and spent 2026
tightening gambling/sweepstakes certification considerably. Separately, buying
ads to fund display-ad revenue almost never nets out — acquisition cost per user
exceeds the impressions they generate.

---

## Open questions

- Static HTML vs prerender for the content pages — decide before October
- Emails vs web push for results. Resend free is 100/day against a potential
  100k participants; web push is free and arguably better suited
- Does the printable need VRC licensing to use Melbourne Cup branding? Sports
  Ink Design sells "official VRC licensed" sweeps, which implies the name and
  marks may be protected. Worth checking before printing anything branded.

---

## Reference

- `INFRA.md` — proxy, Blaze, cron, env vars, pre-launch checklist
- `SCALING.md` — limits by service, TAB fan-out, cron bottleneck, rate limiting
