/**
 * Post-build: turns site/pages.mjs into static HTML so search engines get real
 * content instead of an empty single-page-app shell.
 *
 *   dist/index.html (Vite's SPA shell) → dist/app.html   (vercel.json rewrites app routes here)
 *   site/pages.mjs                      → dist/index.html, dist/<slug>.html
 *   + dist/sitemap.xml, dist/robots.txt
 *
 * Canonical origin: SITE_URL, else Vercel's production domain, else the
 * .vercel.app URL. Adding a custom domain in Vercel updates canonicals on the
 * next build with no code change.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { pages, UPDATED } from '../site/pages.mjs';

const DIST = new URL('../dist/', import.meta.url);

const SITE = (
  process.env.SITE_URL
  || (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`)
  || 'https://sweep-web-nine.vercel.app'
).replace(/\/$/, '');

const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// JSON inside <script> must not be able to close the tag.
const ldjson = (obj) => JSON.stringify(obj).replace(/</g, '\\u003c');

function faqHtml(faq) {
  return faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n  ');
}

function structuredData(page) {
  const url = SITE + page.path;
  const blocks = page.jsonld ? page.jsonld(SITE) : [];
  if (page.path !== '/') {
    blocks.push({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: SITE + '/' },
        { '@type': 'ListItem', position: 2, name: page.crumb, item: url },
      ],
    });
    blocks.push({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: page.title,
      description: page.description,
      dateModified: UPDATED,
      mainEntityOfPage: url,
      image: SITE + '/og.png',
      author: { '@type': 'Organization', name: 'Sweep', url: SITE + '/' },
      publisher: { '@type': 'Organization', name: 'Sweep', url: SITE + '/' },
    });
  }
  if (page.faq) {
    blocks.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: page.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
    });
  }
  if (page.howto) {
    blocks.push({
      '@context': 'https://schema.org',
      '@type': 'HowTo',
      name: 'How to run a Melbourne Cup sweep',
      step: page.howto.map(([name, text], i) => ({ '@type': 'HowToStep', position: i + 1, name, text })),
    });
  }
  return blocks.map(b => `<script type="application/ld+json">${ldjson(b)}</script>`).join('\n  ');
}

function layout(page) {
  const url = SITE + page.path;
  let body = page.body;
  if (page.faq) body = body.replace('{{FAQ}}', faqHtml(page.faq));
  if (page.crumb) {
    body = body.replace('<main>', `<main>\n  <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> › ${esc(page.crumb)}</nav>`);
  }
  return `<!doctype html>
<html lang="en-AU">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(page.title)}</title>
  <meta name="description" content="${esc(page.description)}">
  <link rel="canonical" href="${url}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <meta name="theme-color" content="#0A0E1A">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Sweep">
  <meta property="og:locale" content="en_AU">
  <meta property="og:title" content="${esc(page.title)}">
  <meta property="og:description" content="${esc(page.description)}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${SITE}/og.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap">
  <link rel="stylesheet" href="/site.css">
  ${structuredData(page)}
</head>
<body>
  <a class="skip" href="#content">Skip to content</a>
  <header class="nav">
    <a class="logo" href="/">Sweep<span>.</span></a>
    <nav class="nav-links" aria-label="Main">
      <a class="hide-sm" href="/melbourne-cup-sweep-chart">Printable chart</a>
      <a class="hide-sm" href="/melbourne-cup-sweep-scratchings">Scratchings</a>
      <a href="/my-sweeps">My sweeps</a>
      <a class="btn btn-primary btn-sm" href="/create?race=cup">+ Create</a>
    </nav>
  </header>
  <div id="content">
${body}
  </div>
  <footer>
    <div class="inner">
      <div>
        <a class="logo" href="/">Sweep<span>.</span></a>
        <p class="small muted" style="margin-top:8px">Free online sweeps for the Melbourne Cup and any Australian race.</p>
      </div>
      <div>
        <h4>Melbourne Cup 2026</h4>
        <ul>
          <li><a href="/melbourne-cup-sweep-generator">Sweep generator</a></li>
          <li><a href="/melbourne-cup-sweep-chart">Printable sweep chart</a></li>
          <li><a href="/melbourne-cup-sweep-scratchings">Scratchings</a></li>
          <li><a href="/how-to-run-a-melbourne-cup-sweep">How to run a sweep</a></li>
        </ul>
      </div>
      <div>
        <h4>Your sweep</h4>
        <ul>
          <li><a href="/create?race=cup">Create a sweep</a></li>
          <li><a href="/my-sweeps">My sweeps</a></li>
        </ul>
      </div>
      <p class="fine">Sweep is a free tool for running private sweeps. It doesn't take bets or handle money. Race data from TAB. Gamble responsibly: if gambling is a problem for you or someone you know, call the National Gambling Helpline on 1800 858 858 or visit gamblinghelponline.org.au.</p>
    </div>
  </footer>
  <script src="/site.js" defer></script>
</body>
</html>
`;
}

async function main() {
  // 1. Move the SPA shell aside; the static home page takes index.html.
  const shellPath = new URL('index.html', DIST);
  let shell = await readFile(shellPath, 'utf8');
  shell = shell
    .replace(/<title>.*?<\/title>/s, '<title>Sweep — online Melbourne Cup sweep</title>')
    // Invite links (/join/CODE) get pasted into team chats — make the preview sell it.
    .replace('</head>', [
      '    <meta name="robots" content="noindex">',
      '    <meta name="description" content="Join the Melbourne Cup sweep: free, takes ten seconds, no sign-up.">',
      '    <meta property="og:title" content="You\'re invited to a Melbourne Cup sweep 🏆">',
      '    <meta property="og:description" content="Tap to grab your spot. Horses are drawn at random — free, no sign-up.">',
      `    <meta property="og:image" content="${SITE}/og.png">`,
      '    <meta property="og:type" content="website">',
      '    <meta name="twitter:card" content="summary_large_image">',
      '    <meta name="theme-color" content="#0A0E1A">',
      '  </head>',
    ].join('\n'));
  await writeFile(new URL('app.html', DIST), shell);

  // 2. Static pages.
  for (const page of pages) {
    await writeFile(new URL(page.file, DIST), layout(page));
  }

  // 3. Sitemap + robots.
  const urls = pages.map(p => `  <url><loc>${SITE}${p.path}</loc><lastmod>${UPDATED}</lastmod><priority>${p.priority}</priority></url>`);
  await writeFile(new URL('sitemap.xml', DIST),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);
  await writeFile(new URL('robots.txt', DIST),
    `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /sweep/\nDisallow: /join/\n\nSitemap: ${SITE}/sitemap.xml\n`);

  console.log(`build-pages: ${pages.length} pages + sitemap for ${SITE}`);
}

main().catch(err => { console.error(err); process.exit(1); });
