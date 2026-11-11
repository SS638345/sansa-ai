// After `vite build`: write dist/<slug>.html for every SEO landing page (seo/pages.mjs) and the sitemap.
// Each page is the built index.html with its own title, description, canonical, Open Graph tags,
// JSON-LD (WebApplication + BreadcrumbList + FAQPage) and the page text as real HTML, so search
// engines read it without running JavaScript. The React app then shows the page's tool between
// the top and bottom text (App.tsx "landing mode", data-tool on #seo-page).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { PAGES, SITE } from "../seo/pages.mjs";

const DIST = new URL("../dist/", import.meta.url);
const template = readFileSync(new URL("index.html", DIST), "utf8");
const today = new Date().toISOString().slice(0, 10);

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const bySlug = Object.fromEntries(PAGES.map((p) => [p.slug, p]));
// JSON inside <script>: escape "<" so text can never close the script tag
const ld = (o) => JSON.stringify(o).replace(/</g, "\\u003c");

function must(cond, msg) {
  if (!cond) throw new Error("build-seo-pages: " + msg);
}

function replaceOnce(html, re, value, what) {
  must(re.test(html), `template has no ${what}`);
  return html.replace(re, value);
}

function sectionHtml(s) {
  let h = `<h2>${esc(s.h2)}</h2>`;
  for (const p of s.paragraphs ?? []) h += `<p>${esc(p)}</p>`;
  if (s.steps) h += `<ol class="seo-steps">${s.steps.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>`;
  if (s.bullets) h += `<ul>${s.bullets.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
  if (s.cards) h += `<div class="seo-cards">${s.cards.map(([t, d]) => `<div class="seo-card"><h3>${esc(t)}</h3><p>${esc(d)}</p></div>`).join("")}</div>`;
  return `<section class="seo-sec">${h}</section>`;
}

function pageHtml(p) {
  const url = `${SITE}/${p.slug}`;
  must(p.title.length <= 95, `${p.slug}: title too long (${p.title.length})`);
  must(p.description.length >= 70 && p.description.length <= 170, `${p.slug}: description length ${p.description.length}`);
  for (const r of p.related) must(bySlug[r], `${p.slug}: unknown related page ${r}`);

  const schema = [
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: `SANSA ${p.nav}`,
      url,
      description: p.description,
      applicationCategory: "MultimediaApplication",
      operatingSystem: "Any (web browser)",
      inLanguage: p.lang === "ta" ? ["ta", "en"] : ["en", "ta"],
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
      publisher: { "@type": "Organization", name: "SANSA AI", url: `${SITE}/`, logo: `${SITE}/brand/sansa-icon-512.png` },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: p.nav, item: url },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: p.faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
    },
  ];

  const top = `<section id="seo-top" class="seo-top">
<nav class="seo-crumbs" aria-label="Breadcrumb"><a href="/">Home</a> <span aria-hidden="true">›</span> <span>${esc(p.nav)}</span></nav>
<h1>${esc(p.h1)}</h1>
${p.intro.map((x) => `<p>${esc(x)}</p>`).join("\n")}
</section>`;
  const bottom = `<section id="seo-bottom" class="seo-body">
${p.sections.map(sectionHtml).join("\n")}
<section class="seo-sec"><h2>Frequently asked questions</h2>
${p.faq.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join("\n")}
</section>
<section class="seo-sec"><h2>More free SANSA tools</h2><ul class="seo-links">
${p.related.map((r) => `<li><a href="/${r}">${esc(bySlug[r].nav)}</a></li>`).join("")}
<li><a href="/">All tools on the SANSA home page</a></li></ul></section>
</section>`;

  let h = template;
  h = replaceOnce(h, /<title>[^<]*<\/title>/, `<title>${esc(p.title)}</title>`, "title");
  h = replaceOnce(h, /<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${esc(p.description)}" />`, "description");
  h = replaceOnce(h, /<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${url}" />`, "canonical");
  h = replaceOnce(h, /<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${esc(p.title)}" />`, "og:title");
  h = replaceOnce(h, /<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${esc(p.description)}" />`, "og:description");
  h = replaceOnce(h, /<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${url}" />`, "og:url");
  const og = `${SITE}/og/${p.slug}.png`; // made by scripts/make-og-images.py (1200x630)
  h = replaceOnce(h, /<meta property="og:image" content="[^"]*" \/>/, `<meta property="og:image" content="${og}" />`, "og:image");
  h = replaceOnce(h, /<meta property="og:image:alt" content="[^"]*" \/>/, `<meta property="og:image:alt" content="${esc(p.nav)}: SANSA AI" />`, "og:image:alt");
  h = replaceOnce(h, /<meta name="twitter:image" content="[^"]*" \/>/, `<meta name="twitter:image" content="${og}" />`, "twitter:image");
  h = replaceOnce(h, /<script type="application\/ld\+json">[\s\S]*?<\/script>/, `<script type="application/ld+json">${ld(schema)}</script>`, "JSON-LD");
  h = replaceOnce(
    h,
    /<div id="root">[\s\S]*?<\/div>\s*<\/div>/,
    `<div id="root"></div>\n    <div id="seo-page" data-tool="${p.tool}">\n${top}\n${bottom}\n    </div>`,
    "#root fallback block",
  );
  return h;
}

for (const p of PAGES) {
  must(existsSync(new URL(`og/${p.slug}.png`, DIST)), `${p.slug}: share image public/og/${p.slug}.png missing (run scripts/make-og-images.py)`);
  writeFileSync(new URL(`${p.slug}.html`, DIST), pageHtml(p));
}

// sitemap: home, tool pages, company pages
const urls = [
  ["/", "1.0"],
  ...PAGES.map((p) => [`/${p.slug}`, "0.9"]),
  ["/about", "0.5"],
  ["/contact", "0.5"],
  ["/privacy", "0.3"],
  ["/terms", "0.3"],
  ["/refund", "0.3"],
  ["/security", "0.3"],
];
writeFileSync(
  new URL("sitemap.xml", DIST),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map(([u, pr]) => `  <url><loc>${SITE}${u}</loc><lastmod>${today}</lastmod><priority>${pr}</priority></url>`).join("\n") +
    `\n</urlset>\n`,
);
console.log(`build-seo-pages: ${PAGES.length} pages + sitemap (${urls.length} URLs)`);
