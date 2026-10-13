/**
 * Content for the static, indexable pages. Rendered to plain HTML at build
 * time by scripts/build-pages.mjs — Google gets real text, not an empty SPA.
 *
 * Facts used here (verify each year):
 *   Melbourne Cup 2026: Tue 3 Nov, 3:00pm AEDT, Flemington Race 7, 3200m,
 *   max 24 runners (no emergencies). Final field declared 4:30pm Sat 31 Oct;
 *   barrier draw from 6:30pm Sat 31 Oct. (races.com.au/melbourne-cup)
 *   Victoria sweep rules: VGCCC "Melbourne Cup sweeps" page.
 */

export const UPDATED = '2026-10-13';
export const UPDATED_HUMAN = '13 October 2026';

const CREATE = '/create?race=cup';

const keyFacts = `
<ul class="facts">
  <li><b>Tue 3 Nov</b><span>Race day, 3:00pm AEDT</span></li>
  <li><b>Flemington R7</b><span>3200 metres</span></li>
  <li><b>24 runners max</b><span>No emergencies</span></li>
  <li><b>Sat 31 Oct</b><span>Field 4:30pm, barriers from 6:30pm</span></li>
</ul>`;

const ctaCard = (headline = 'Run your Cup sweep online, free') => `
<div class="card highlight no-print">
  <h2>${headline}</h2>
  <p>Create a sweep, share one link, and the draw does itself. Horse names, barriers and scratchings update live from TAB's field data, and results come in automatically after the race.</p>
  <a class="btn btn-primary" href="${CREATE}">Create a Cup sweep</a>
</div>`;

// ─────────────────────────────────────────────────────────────────────────────

export const pages = [
  // ── Home ──────────────────────────────────────────────────────────────────
  {
    path: '/',
    file: 'index.html',
    title: 'Melbourne Cup Sweep 2026 — Free Online Sweep That Handles Scratchings',
    description: 'Run your 2026 Melbourne Cup sweep online for free. Random draw, one invite link, live horse names and scratchings from the official field, and automatic results.',
    priority: '1.0',
    jsonld: (site) => [
      {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'Sweep',
        url: site + '/',
      },
      {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: 'Sweep — Melbourne Cup sweep generator',
        url: site + '/',
        applicationCategory: 'UtilitiesApplication',
        operatingSystem: 'Any (web browser)',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'AUD' },
        description: 'Free online Melbourne Cup sweep: random draw, invite link, live scratchings and automatic results.',
      },
    ],
    body: `
<main class="wide">
  <section class="hero">
    <p class="kicker">Melbourne Cup 2026 · <span data-countdown>Tue 3 Nov, 3:00pm AEDT</span></p>
    <h1>The Melbourne Cup sweep,<br><em>without the printout</em></h1>
    <p class="lede">Create your sweep in seconds, send one link to the office, and let the app draw the horses. When a horse is scratched on the morning of the race, it tells everyone. When the race is run, it posts the results.</p>
    <div class="cta">
      <a class="btn btn-primary" href="${CREATE}">Create a Cup sweep (free)</a>
      <a class="btn btn-ghost" href="/how-to-run-a-melbourne-cup-sweep">How it works</a>
    </div>
    <form class="join" data-join action="/join" aria-label="Join a sweep with a code">
      <input name="code" placeholder="Got a code?" maxlength="8" autocomplete="off" aria-label="Join code">
      <button class="btn btn-ghost" type="submit">Join</button>
    </form>
    <p class="your-sweeps"><a href="/my-sweeps">Your sweeps →</a></p>
  </section>

  ${keyFacts}

  <h2>How an online Cup sweep works</h2>
  <div class="grid">
    <div class="card"><span class="step-num">1</span><h3>Create it</h3><p>Name your sweep, set the entry fee and how many horses each person can have. No account, no app to download.</p></div>
    <div class="card"><span class="step-num">2</span><h3>Share one link</h3><p>Drop the invite link in the team chat. People join from their phone and you can see who's in.</p></div>
    <div class="card"><span class="step-num">3</span><h3>Draw</h3><p>Hit draw and every entrant gets a random horse. You can draw before the field is out: numbers turn into horse names on 31 October.</p></div>
    <div class="card"><span class="step-num">4</span><h3>Watch it run</h3><p>Scratchings are flagged live, and first, second and third are posted when TAB confirms the result.</p></div>
  </div>

  <h2>Why not just print a chart?</h2>
  <p>A paper sweep chart works fine right up until a horse is scratched. That can happen any time up to the jump, often on the morning of the race, and with a printout someone has to notice, chase the entrant, and agree what happens next. Sweep watches the live field for you, marks the scratched horse for everyone in the sweep, and lets the organiser re-draw that person onto a horse nobody holds. <a href="/melbourne-cup-sweep-scratchings">How sweep scratchings work →</a></p>
  <p>Prefer paper anyway? Our <a href="/melbourne-cup-sweep-chart">printable Melbourne Cup sweep chart</a> fills itself in with the 2026 field and barriers.</p>

  <h2>Guides</h2>
  <div class="grid">
    <a class="card" href="/melbourne-cup-sweep-generator" style="text-decoration:none"><h3>Sweep generator</h3><p class="muted small">How the random draw works, and drawing before the field is announced.</p></a>
    <a class="card" href="/melbourne-cup-sweep-scratchings" style="text-decoration:none"><h3>Scratchings</h3><p class="muted small">What happens to your sweep when a horse is withdrawn.</p></a>
    <a class="card" href="/melbourne-cup-sweep-chart" style="text-decoration:none"><h3>Printable chart</h3><p class="muted small">A free 24-horse chart that auto-fills with the field.</p></a>
    <a class="card" href="/how-to-run-a-melbourne-cup-sweep" style="text-decoration:none"><h3>How to run a sweep</h3><p class="muted small">Entry fees, prize splits and the rules that keep it legal.</p></a>
  </div>

  <h2>Questions</h2>
  <details><summary>Is it free?</summary><p>Yes. Free to create, free to join, no ads in the sweep, and no account needed.</p></details>
  <details><summary>Does Sweep handle the money?</summary><p>No. Collect entry fees the way you normally would (cash, bank transfer, PayID). Sweep records who's in and who drew what. Every dollar collected should go back out as prizes.</p></details>
  <details><summary>Can we do the draw before the field is announced?</summary><p>Yes. Before the field is declared on Saturday 31 October, the draw hands out saddlecloth numbers 1–24. Horse names and barriers attach to those numbers automatically once the field is published.</p></details>
  <details><summary>What if a horse is scratched?</summary><p>Everyone in the sweep sees it flagged. The organiser can re-draw the affected entrant onto an unallocated horse in one tap, or refund them. Agree which before the draw.</p></details>
</main>`,
  },

  // ── Generator ─────────────────────────────────────────────────────────────
  {
    path: '/melbourne-cup-sweep-generator',
    file: 'melbourne-cup-sweep-generator.html',
    title: 'Melbourne Cup Sweep Generator 2026 — Free Random Draw Online',
    description: 'Free Melbourne Cup sweep generator: random horse draw in one tap, invite link for the office, draw before the field is out, live scratchings and automatic results.',
    priority: '0.9',
    crumb: 'Sweep generator',
    faq: [
      ['Is the Melbourne Cup sweep generator free?', 'Yes. Creating and joining sweeps is free and needs no account.'],
      ['Can I generate the sweep before the field is announced?', 'Yes. Before the final field is declared at 4:30pm AEDT on Saturday 31 October, the generator draws saddlecloth numbers 1–24. Names and barriers attach to the numbers automatically once the field is out.'],
      ['How random is the draw?', 'Each draw uses a Fisher–Yates shuffle, the standard method for a fair random ordering: every horse is equally likely to land with every entrant.'],
      ['What if more than 24 people want in?', 'Let people take more than one horse each, or run two sweeps. With more entrants than horses, some horses are shared.'],
      ['Can people have more than one horse?', 'Yes. Set "max entries per person" when you create the sweep, and each person can claim up to that many spots.'],
      ['Does the generator take payments?', 'No. Collect entry fees yourself. All of the money should go back to entrants as prizes.'],
    ],
    body: `
<main>
  <h1>Melbourne Cup Sweep Generator</h1>
  <p class="updated">Updated ${UPDATED_HUMAN} for the 2026 Melbourne Cup</p>
  <p>A sweep generator does the one job everyone argues about: drawing the horses fairly. Sweep goes further. It runs the whole thing online, from the invite to the results, so nobody has to sit with a hat full of paper or keep a spreadsheet.</p>

  ${keyFacts}

  <div class="callout"><strong>Short version:</strong> <a href="${CREATE}">create a sweep</a> → share the link → press draw. Takes about a minute.</div>

  <h2>How to generate a Melbourne Cup sweep</h2>
  <ol>
    <li><strong>Create the sweep.</strong> Pick "Melbourne Cup 2026", give it a name ("Accounts team sweep"), and set the entry fee and how many horses each person can hold.</li>
    <li><strong>Invite people.</strong> Share the link or the six-letter join code. Entrants join from any phone or computer, with no sign-up.</li>
    <li><strong>Collect the money your usual way.</strong> The app tracks who's in; you handle the cash or transfers.</li>
    <li><strong>Press draw.</strong> Every entrant is randomly allocated a horse, and everyone sees the result at the same time.</li>
    <li><strong>Race day.</strong> Scratchings are flagged as they happen, and the placings are posted once TAB confirms the result.</li>
  </ol>

  <h2>Draw now, or wait for the field?</h2>
  <p>The Cup field isn't final until acceptances close at <strong>4:30pm AEDT on Saturday 31 October</strong>, and the barrier draw follows from 6:30pm that evening. Most offices want their sweep sorted well before that, so the generator supports both:</p>
  <ul>
    <li><strong>Draw early:</strong> entrants get saddlecloth numbers 1–24. Once the field is published, each number shows its horse and barrier automatically.</li>
    <li><strong>Draw after the field is out:</strong> entrants get named horses straight away, and scratched horses are left out of the draw.</li>
  </ul>

  <h2>What makes the draw fair</h2>
  <p>The generator shuffles the horses with a Fisher–Yates shuffle and deals them out in order, the computer version of drawing from a hat. Each horse is equally likely to go to each entrant, and the organiser can't see the result before pressing the button. Everyone sees the same draw the moment it's done.</p>

  <h2>Generator features</h2>
  <ul>
    <li>Up to 24 horses, with multiple horses per person if you allow it</li>
    <li>Invite link and join code, with no accounts or app downloads</li>
    <li>Live horse names, barriers and <a href="/melbourne-cup-sweep-scratchings">scratchings</a> from the official field</li>
    <li>One-tap re-draw for anyone whose horse is scratched</li>
    <li>Results posted automatically, with optional email to entrants</li>
    <li>A <a href="/melbourne-cup-sweep-chart">printable chart</a> if you want something for the office wall</li>
  </ul>

  ${ctaCard('Generate your sweep now')}

  <h2>FAQ</h2>
  {{FAQ}}
</main>`,
  },

  // ── Scratchings ───────────────────────────────────────────────────────────
  {
    path: '/melbourne-cup-sweep-scratchings',
    file: 'melbourne-cup-sweep-scratchings.html',
    title: 'Melbourne Cup Sweep Scratchings 2026 — What Happens If Your Horse Is Scratched',
    description: 'Horse scratched from the Melbourne Cup? How sweeps handle scratchings — refund, redraw or all-in — plus the live 2026 scratchings list, updated live from TAB.',
    priority: '0.9',
    crumb: 'Scratchings',
    faq: [
      ['What happens in a sweep if my horse is scratched?', 'It depends on the rule your organiser set before the draw. The three common rules are: a refund, a re-draw onto an unallocated horse, or "all-in" where scratched entrants simply miss out.'],
      ['When are Melbourne Cup horses scratched?', 'A horse can be scratched at any time up to the start of the race. Late scratchings on the morning of the Cup are not unusual, often for vet or soundness reasons.'],
      ['Does the Melbourne Cup have emergencies?', 'No. The Cup field is capped at 24 with no emergency acceptors, so a scratching simply leaves a smaller field. No reserve horse comes in.'],
      ['Does the sweep app update scratchings automatically?', 'Yes. Sweep checks the live TAB field and marks scratched horses for everyone in the sweep. The organiser can then re-draw affected entrants onto horses nobody holds.'],
    ],
    body: `
<main>
  <h1>Melbourne Cup Sweep Scratchings</h1>
  <p class="updated">Updated ${UPDATED_HUMAN} · live list below once the field is out</p>
  <p>Every year someone in the office sweep draws a horse that doesn't make it to the barrier. Here's what usually happens, what the fair options are, and the live 2026 scratchings list.</p>

  <div class="card">
    <h2>Live 2026 scratchings</h2>
    <p class="status-line" data-field-status>The final field isn't out yet. It's declared at 4:30pm AEDT on Saturday 31 October, with the barrier draw from 6:30pm. This list fills itself in after that.</p>
    <ul id="scratchings-list"></ul>
    <p class="small muted">Source: TAB, updated every few minutes. Always confirm with the official field before paying out.</p>
  </div>

  <h2>What is a scratching?</h2>
  <p>A scratching is a horse withdrawn from a race after the field has been declared, usually by the trainer or the stewards for a vet, soundness or track-condition reason. A horse can be scratched right up until the race starts. The Melbourne Cup has <strong>no emergencies</strong>: the field is capped at 24, so a scratched horse isn't replaced and the field just gets smaller.</p>

  <h2>Three ways to handle a scratching in your sweep</h2>
  <p>None of these is "the" rule. What matters is that everyone knows which one applies <em>before</em> the draw.</p>
  <h3>1. Refund</h3>
  <p>The entrant gets their money back and the prize pool shrinks. Simple and hard to argue with, but the prizes change on the day.</p>
  <h3>2. Re-draw onto an unallocated horse</h3>
  <p>If your sweep has fewer entrants than horses, the scratched entrant draws again from the horses nobody holds. This keeps the prize pool intact and everyone in the race. It's the fairest option when spare horses exist.</p>
  <h3>3. All-in, no refunds</h3>
  <p>Scratched entrants miss out and the prize pool stays the same. It's common in big sweeps, but say so up front, because it's the rule people complain about most.</p>

  <div class="callout">Whatever you choose, write it down when you collect the money. In Victoria the sweep regulator expects the prize list to be clear to everyone before the sweep starts, and spelling out the scratchings rule is part of that. <a href="/how-to-run-a-melbourne-cup-sweep">More on the rules →</a></div>

  <h2>How Sweep handles scratchings</h2>
  <ul>
    <li><strong>Automatic:</strong> the app checks TAB's live field and marks any scratched horse for everyone in the sweep, with no need to refresh a racing site.</li>
    <li><strong>One-tap re-draw:</strong> the organiser can re-draw scratched entrants onto unallocated horses. It's the same fair shuffle as the original draw, and everyone sees the result.</li>
    <li><strong>No spare horses?</strong> If all 24 are taken, the app says so, and you fall back to a refund or all-in.</li>
    <li><strong>Drew early?</strong> Number draws (before the field is out) are matched to horses later. If a number ends up with no runner, it's treated as scratched.</li>
  </ul>

  ${ctaCard('A sweep that deals with scratchings for you')}

  <h2>FAQ</h2>
  {{FAQ}}
</main>`,
  },

  // ── Printable chart ───────────────────────────────────────────────────────
  {
    path: '/melbourne-cup-sweep-chart',
    file: 'melbourne-cup-sweep-chart.html',
    title: 'Melbourne Cup Sweep Chart 2026 — Free Printable (Auto-Fills With the Field)',
    description: 'Free printable 2026 Melbourne Cup sweep chart: 24 horses with numbers, names, barriers and a column for entrants. Fills itself in with the official field and scratchings.',
    priority: '0.9',
    crumb: 'Printable chart',
    body: `
<main>
  <h1>Melbourne Cup Sweep Chart 2026</h1>
  <p class="updated no-print">Updated ${UPDATED_HUMAN} · free to print</p>
  <p class="no-print">A clean, free sweep chart for the 2026 Melbourne Cup. Before the field is announced it's a blank 1–24 chart. After 4:30pm AEDT on Saturday 31 October it fills in the horses and barriers automatically, and marks scratchings.</p>
  <p class="no-print"><button class="btn btn-primary" type="button" data-print>Print the chart</button> <a class="btn btn-ghost" href="${CREATE}">Or run it online</a></p>
  <p class="status-line no-print" data-field-status>The final field isn't out yet. It's declared at 4:30pm AEDT on Saturday 31 October, with the barrier draw from 6:30pm. This chart fills itself in after that.</p>

  <div class="print-only"><h2>Melbourne Cup 2026 — Office Sweep</h2><p>Flemington · Tuesday 3 November · 3:00pm AEDT · Entry: $______</p></div>

  <div class="table-wrap">
    <table>
      <thead><tr><th>No.</th><th>Horse</th><th>Barrier</th><th>Entrant</th><th></th></tr></thead>
      <tbody id="field-body">
        ${Array.from({ length: 24 }, (_, i) => `<tr><td>${i + 1}</td><td></td><td></td><td></td><td class="status"></td></tr>`).join('\n        ')}
      </tbody>
    </table>
  </div>

  <div class="print-only"><p>Prizes: 1st $______ · 2nd $______ · 3rd $______ · Last $______<br>Scratchings rule: ☐ Refund ☐ Re-draw ☐ All-in</p></div>

  <div class="no-print">
    <h2>How to use the chart</h2>
    <ol>
      <li>Print it (A4, portrait). Fill in the entry fee and prizes at the bottom.</li>
      <li>Collect entries and write each person's name next to a number. Draw numbers from a hat to keep it fair.</li>
      <li>After the field is out on Saturday 31 October, reload this page and print again for the horse names and barriers.</li>
      <li>Check this page on the morning of the race for late <a href="/melbourne-cup-sweep-scratchings">scratchings</a>.</li>
    </ol>
    <p>Rather skip the paper? The <a href="/melbourne-cup-sweep-generator">online sweep generator</a> does the draw, tracks scratchings and posts the results, and you can still print the final chart from here.</p>
    ${ctaCard()}
  </div>
</main>`,
  },

  // ── How-to guide ──────────────────────────────────────────────────────────
  {
    path: '/how-to-run-a-melbourne-cup-sweep',
    file: 'how-to-run-a-melbourne-cup-sweep.html',
    title: 'How to Run a Melbourne Cup Sweep (2026): Rules, Prize Splits & Legal Limits',
    description: 'Step-by-step guide to running a Melbourne Cup sweep in 2026: entry fees, prize splits, the draw, scratchings, and the rules that keep an office sweep legal.',
    priority: '0.8',
    crumb: 'How to run a sweep',
    howto: [
      ['Set the entry fee and prizes', 'Decide the ticket price and how the pool is split (for example 1st, 2nd, 3rd and last) and tell everyone before you collect money.'],
      ['Agree the scratchings rule', 'Choose refund, re-draw or all-in for scratched horses, and write it down.'],
      ['Collect entries', 'Take names and money. Up to 24 horses run, so allow multiple tickets per person if more than 24 want in.'],
      ['Do the draw', 'Draw horses (or numbers 1–24 before the field is out) at random, in front of everyone or online.'],
      ['Handle scratchings', 'Check the field on race morning and apply your scratchings rule.'],
      ['Pay out', 'After the race, pay every dollar collected back out as prizes.'],
    ],
    body: `
<main>
  <h1>How to Run a Melbourne Cup Sweep</h1>
  <p class="updated">Updated ${UPDATED_HUMAN} for the 2026 Melbourne Cup</p>
  <p>The office sweep is a Cup Day institution, and running one takes about ten minutes if you set it up properly. Here's the whole process, from setting the entry fee to paying out, plus the rules that keep it legal.</p>

  ${keyFacts}

  <h2>1. Set the entry fee and prizes</h2>
  <p>Pick a ticket price people won't think twice about. $5–$20 is typical for an office. Then decide how the pool is split. Paying first, second, third and last is the most common structure. One example split:</p>
  <div class="table-wrap"><table>
    <thead><tr><th>Place</th><th>Share</th><th>24 × $10 tickets</th></tr></thead>
    <tbody>
      <tr><td>1st</td><td>60%</td><td>$144</td></tr>
      <tr><td>2nd</td><td>20%</td><td>$48</td></tr>
      <tr><td>3rd</td><td>10%</td><td>$24</td></tr>
      <tr><td>Last</td><td>10%</td><td>$24</td></tr>
    </tbody>
  </table></div>
  <p>Whatever you choose, the prize list should be settled and shared <em>before</em> anyone pays.</p>

  <h2>2. Agree what happens with scratchings</h2>
  <p>Horses get scratched, sometimes on the morning of the race. Decide up front whether a scratched entrant gets a refund, a re-draw onto a spare horse, or nothing (all-in). <a href="/melbourne-cup-sweep-scratchings">Pros and cons of each →</a></p>

  <h2>3. Collect entries</h2>
  <p>The Cup has a maximum of 24 runners. If more than 24 people want in, let people buy more than one ticket in a smaller pool, or run two sweeps. Keep a record of who has paid. An <a href="/melbourne-cup-sweep-generator">online sweep</a> keeps the entrant list for you.</p>

  <h2>4. Do the draw</h2>
  <p>The classic method is names in one hat and horse numbers in another. Online, the draw is a random shuffle everyone can see. You don't need to wait for the field: draw numbers 1–24 any time, and they become horses when the field is declared at 4:30pm AEDT on Saturday 31 October (barriers are drawn from 6:30pm that night).</p>

  <h2>5. Race day</h2>
  <p>Check the <a href="/melbourne-cup-sweep-scratchings">scratchings</a> on Tuesday morning and apply your rule. The race jumps at 3:00pm AEDT (Melbourne time). That's 3:00pm in Sydney, Canberra and Hobart, 2:00pm in Brisbane, 2:30pm in Adelaide, 1:30pm in Darwin and 12:00pm in Perth.</p>

  <h2>6. Pay out</h2>
  <p>Pay the placings once the result is official. Protests occasionally change the order, so wait for the "correct weight" or final result. Every dollar collected goes back out as prizes.</p>

  <h2>Is an office sweep legal?</h2>
  <p>Small private sweeps are generally allowed in Australia, but the rules are set by each state and territory, and they differ. In <strong>Victoria</strong>, the Victorian Gambling and Casino Control Commission says a Melbourne Cup sweep must meet these conditions:</p>
  <ul>
    <li>all money collected is returned as prizes</li>
    <li>the organiser can't keep any of it for costs or expenses</li>
    <li>the total value of prizes is no more than $5,000</li>
    <li>the prize list is finalised and clear to entrants before the sweep starts</li>
  </ul>
  <p>Other states have their own conditions, and some require a permit for some kinds of sweep or fundraiser. If you're running a large sweep, raising money for a club or charity, or taking a cut for any reason, check with your state's gaming regulator first.</p>
  <div class="callout warn">This is general information, not legal advice. Source: <a href="https://www.vgccc.vic.gov.au/for-community/community-and-charitable-fundraising/melbourne-cup-sweeps" rel="noopener">VGCCC — Melbourne Cup sweeps</a>.</div>

  ${ctaCard('Skip the hat — run it online')}
</main>`,
  },
];
