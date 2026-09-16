// Growlancer ELEMENT-LEVEL UI audit (Section-1 universal checklist)
// ─────────────────────────────────────────────────────────────────────────────
// Unlike device-audit.mjs (which checks "does the page load without errors"),
// this harness checks "is everything ON the page correct":
//
//   A. TEXT      leftover placeholder/lorem/TODO text, silently clipped text
//                (scrollWidth > clientWidth without CSS ellipsis), broken
//                currency glyphs / wrong currency symbols, '�' mojibake
//   B. BUTTONS   generic labels ("OK", "Submit", "Click here"), <a> without
//                href acting as a button
//   C. ICONS     interactive elements with no accessible name (icon-only
//                buttons without aria-label/title)
//   D. FORMS     meaningless placeholders, inputs missing any label/aria
//   E. LINKS     internal links that 404, external links missing
//                target=_blank / rel=noopener, broken images
//   F. MEDIA     broken images, missing alt
//   I. LAYOUT    horizontal-overflow offenders at 375 / 768 / 1280 (excluding
//                intentional horizontal scrollers)
//   + global:    page errors, console errors, 4xx, duplicate ids, heading
//                skips, missing <title>/<html lang>/viewport meta
//
// Usage:
//   node scripts/e2e/element-audit.mjs --base=http://localhost:4174 --group=public
//   groups: public | auth | dashboard | client | admin | all
//
// Artifacts land in tests/e2e-artifacts/ (gitignored).

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const CHROME_CANDIDATES = [
  process.env.E2E_CHROME_PATH,
  `${process.env.LOCALAPPDATA}\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe`,
  `${process.env.LOCALAPPDATA}\\ms-playwright\\chromium_headless_shell-1243\\chrome-headless-shell-win64\\chrome-headless-shell.exe`,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...rest] = a.replace(/^--/, '').split('=');
    return [k, rest.join('=') || 'true'];
  })
);

const BASE = args.base || 'http://localhost:4174';
const GROUP = args.group || 'all';
const CONCURRENCY = Number(args.concurrency || 4);
const OUT_DIR = path.resolve(args.out || 'tests/e2e-artifacts');
const PREFIX = args.prefix || 'element-audit';

const VIEWPORTS = [
  { name: 'mobile-375', width: 375, height: 667, dpr: 2, mobile: true },
  { name: 'tablet-768', width: 768, height: 1024, dpr: 2, mobile: true },
  { name: 'desktop-1280', width: 1280, height: 800, dpr: 1, mobile: false },
];

// Concrete URL list derived from src/app/App.tsx route tree. Dynamic :params
// get a dummy value — the page must show a graceful not-found/empty state,
// never a crash (that is exactly what we test).
const ROUTE_GROUPS = {
  public: [
    '/', '/how-it-works', '/features', '/categories', '/pricing', '/about',
    '/philosophy', '/internships', '/careers', '/contact', '/report',
    '/help-center', '/safety', '/guidelines', '/status', '/terms', '/privacy',
    '/escrow-policy', '/refund-policy', '/cookies',
    '/freelancers', '/services', '/contests', '/login', '/signup',
    '/freelancer/e2e-dummy-id', '/services/e2e-dummy-id', '/contests/e2e-dummy-id',
    '/projects/e2e-dummy-id',
    '/payment/success', '/payment/cancel', '/payment/pending',
    '/certificate', '/verify-certificate', '/certificate/e2e-dummy-code',
  ],
  auth: [
    '/auth/callback', '/auth/forgot-password', '/auth/reset-password',
    '/auth/magic-link', '/auth/otp', '/auth/email-confirm', '/auth/verify-email',
    '/onboarding', '/onboarding/freelancer', '/onboarding/client',
    '/waitlist', '/this-route-does-not-exist',
  ],
  dashboard: [
    '/dashboard', '/dashboard/feed', '/dashboard/invites', '/dashboard/proposals',
    '/dashboard/contracts', '/dashboard/workspace', '/dashboard/wallet',
    '/dashboard/profile', '/dashboard/referrals', '/dashboard/pro',
    '/dashboard/ai-assistant', '/dashboard/services', '/dashboard/services/create',
    '/dashboard/portfolio', '/dashboard/analytics', '/dashboard/notifications',
    '/dashboard/disputes', '/dashboard/identity-verification',
    '/dashboard/certifications', '/dashboard/certifications/e2e-dummy-test',
    '/dashboard/time-tracking', '/dashboard/contests', '/dashboard/help-center',
    '/dashboard/support-tickets',
  ],
  client: [
    '/client', '/client/post', '/client/projects', '/client/matches',
    '/client/invites', '/client/proposals', '/client/contracts',
    '/client/workspace', '/client/workspace/e2e-dummy-id',
    '/client/notifications', '/client/payments', '/client/settings',
    '/client/verification', '/client/referrals', '/client/team-projects',
    '/client/team-projects/create', '/client/team-projects/e2e-dummy-id',
    '/client/ai-assistant', '/client/find-talent', '/client/reviews',
    '/client/contests', '/client/contests/create', '/client/help-center',
  ],
  admin: [
    '/admin', '/admin/users', '/admin/projects', '/admin/contracts',
    '/admin/payments', '/admin/finance', '/admin/withdrawals', '/admin/disputes',
    '/admin/subscriptions', '/admin/reports', '/admin/internships',
    '/admin/certificates', '/admin/identity-verification',
    '/admin/support-tickets', '/admin/user-reports', '/admin/waitlist',
    '/admin/data-isolation',
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// In-page collector — plain JSON out.
// ─────────────────────────────────────────────────────────────────────────────
function inPageAudit(device) {
  const vw = window.innerWidth;

  function shortSelector(el) {
    if (!el || el === document.body) return 'body';
    const parts = [];
    let node = el;
    let depth = 0;
    while (node && node !== document.body && depth < 4) {
      let s = node.tagName.toLowerCase();
      if (node.id) { parts.unshift(`${s}#${node.id}`); break; }
      const cls = (node.getAttribute('class') || '').split(/\s+/).filter(Boolean)
        .slice(0, 2).map((c) => `.${CSS.escape(c)}`).join('');
      s += cls;
      const parent = node.parentElement;
      if (parent) {
        const sibs = Array.from(parent.children).filter((c) => c.tagName === node.tagName);
        if (sibs.length > 1) s += `:nth-of-type(${sibs.indexOf(node) + 1})`;
      }
      parts.unshift(s);
      node = node.parentElement;
      depth++;
    }
    return parts.join(' > ') || el.tagName.toLowerCase();
  }

  function label(el, max = 60) {
    const t = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
    return t.length > max ? `${t.slice(0, max - 3)}...` : t;
  }

  function visible(el) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function accessibleName(el) {
    const aria = el.getAttribute('aria-label');
    if (aria && aria.trim()) return aria.trim();
    const lb = el.getAttribute('aria-labelledby');
    if (lb) {
      const t = lb.split(/\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' ').trim();
      if (t) return t;
    }
    const title = el.getAttribute('title');
    if (title && title.trim()) return title.trim();
    if (el.textContent && el.textContent.trim()) return el.textContent.trim();
    // image inside link/button counts as its name
    const img = el.querySelector('img[alt]');
    if (img && img.getAttribute('alt').trim()) return img.getAttribute('alt').trim();
    return '';
  }

  const out = {
    badText: [],          // A: leftover placeholder / lorem / TODO
    clippedText: [],      // A: silently clipped (no ellipsis)
    badCurrency: [],      // A: wrong symbol / broken glyph
    genericButtons: [],   // B: vague labels
    hreflessLinks: [],    // B: <a> without href
    unnamedInteractive: [],// C: icon-only without accessible name
    badPlaceholders: [],  // D: meaningless placeholders
    unlabeledInputs: [],  // D: inputs with no label association
    externalLinkIssues: [],// E: external without target/rel
    internalLinks: [],    // E: hrefs to verify (deduped)
    brokenImages: [],     // F
    missingAlt: [],       // F
    overflowOffenders: [],// I (non-scroller only)
    duplicateIds: [],
    headingSkips: [],
    docIssues: [],
  };

  // ── A. TEXT ────────────────────────────────────────────────────────────────
  const BAD_TEXT_RE = /\b(lorem ipsum|todo[:\s]|fixme|tbd\b|sample text|test 123|dummy text|placeholder text|asdf|xxxxx)\b/i;
  const CURRENCY_RE = /(\$\s?\d)|(\bRs\.?\s?\d)|(\bUSD\s?\d)|(\bINR\s?\d)|(€\s?\d)|(�)/i;
  const seenText = new Set();
  for (const el of document.body.querySelectorAll('p, span, div, li, a, button, label, h1, h2, h3, h4, h5, h6, td, th, small, strong, em, figcaption, blockquote, option')) {
    if (!visible(el)) continue;
    const hasTextChild = Array.from(el.children).some((c) => (c.textContent || '').trim());
    if (hasTextChild) continue;
    const text = (el.textContent || '').trim();
    if (!text || seenText.has(text)) continue;
    seenText.add(text);
    const m = text.match(BAD_TEXT_RE);
    if (m) out.badText.push({ selector: shortSelector(el), text: label(el), match: m[1] });
    const c = text.match(CURRENCY_RE);
    if (c) out.badCurrency.push({ selector: shortSelector(el), text: label(el), match: c[1] || c[0] });
    if (out.badText.length + out.badCurrency.length > 14) break;
  }

  // A2. silently clipped text (mobile only): scrollWidth overflow WITHOUT
  // text-overflow:ellipsis (ellipsis truncation is an intentional design token).
  if (device.mobile) {
    let clipped = 0;
    for (const el of document.body.querySelectorAll('p, span, a, button, label, h1, h2, h3, h4, h5, h6, td, th, small')) {
      if (!visible(el)) continue;
      const hasTextChild = Array.from(el.children).some((c) => (c.textContent || '').trim());
      if (hasTextChild) continue;
      const cs = getComputedStyle(el);
      if (cs.textOverflow === 'ellipsis') continue;
      if (cs.whiteSpace === 'nowrap' && el.scrollWidth > el.clientWidth + 4) {
        out.clippedText.push({ selector: shortSelector(el), text: label(el, 40), over: el.scrollWidth - el.clientWidth });
        if (++clipped >= 6) break;
      }
    }
  }

  // ── B. BUTTONS ─────────────────────────────────────────────────────────────
  const GENERIC = new Set(['ok', 'submit', 'click here', 'here', 'go', 'button', 'click', 'yes', 'no']);
  for (const el of document.body.querySelectorAll('button, [role="button"], a[href]')) {
    if (!visible(el)) continue;
    if (el.closest('[aria-hidden="true"]')) continue;
    const name = accessibleName(el).toLowerCase().replace(/[^\w\s]/g, '').trim();
    if (GENERIC.has(name)) {
      out.genericButtons.push({ selector: shortSelector(el), tag: el.tagName.toLowerCase(), name: accessibleName(el) });
    }
    if (el.tagName === 'A' && !el.hasAttribute('href')) {
      out.hreflessLinks.push({ selector: shortSelector(el), text: label(el, 40) });
    }
  }

  // ── C. ICONS (unnamed interactive) ────────────────────────────────────────
  for (const el of document.body.querySelectorAll('a[href], button, [role="button"], [role="tab"], [role="menuitem"], summary')) {
    if (!visible(el)) continue;
    if (el.closest('[aria-hidden="true"]')) continue;
    if (!accessibleName(el)) {
      out.unnamedInteractive.push({ selector: shortSelector(el), tag: el.tagName.toLowerCase(), text: label(el, 30) });
    }
  }

  // ── D. FORMS ──────────────────────────────────────────────────────────────
  const BAD_PLACEHOLDER = /^(enter [a-z ]{3,20}|type here|enter here|type something|\*+|—|-)$/i;
  for (const el of document.body.querySelectorAll('input:not([type="hidden"]), textarea')) {
    if (!visible(el)) continue;
    const ph = el.getAttribute('placeholder') || '';
    if (ph && BAD_PLACEHOLDER.test(ph.trim())) {
      out.badPlaceholders.push({ selector: shortSelector(el), placeholder: ph });
    }
    // label association: <label for>, wrapping label, aria-label, aria-labelledby, title
    const id = el.id;
    const hasLabel =
      (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) ||
      el.closest('label') ||
      el.getAttribute('aria-label') ||
      el.getAttribute('aria-labelledby') ||
      el.getAttribute('title');
    if (!hasLabel) out.unlabeledInputs.push({ selector: shortSelector(el), type: el.type, placeholder: ph });
  }

  // ── E/F. LINKS + IMAGES ───────────────────────────────────────────────────
  const hrefs = new Set();
  for (const a of document.body.querySelectorAll('a[href]')) {
    if (!visible(a)) continue;
    const href = a.getAttribute('href') || '';
    if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) continue;
    const abs = new URL(href, location.href);
    if (abs.origin !== location.origin) {
      const target = a.getAttribute('target');
      const rel = a.getAttribute('rel') || '';
      if (target !== '_blank') out.externalLinkIssues.push({ href: abs.href.slice(0, 120), issue: 'no-target-blank' });
      else if (!rel.includes('noopener')) out.externalLinkIssues.push({ href: abs.href.slice(0, 120), issue: 'no-rel-noopener' });
    } else if (!hrefs.has(abs.pathname + abs.search)) {
      hrefs.add(abs.pathname + abs.search);
      out.internalLinks.push(abs.pathname + abs.search);
    }
  }

  for (const img of document.querySelectorAll('img')) {
    if (!visible(img)) continue;
    const src = img.getAttribute('src') || '';
    if (img.complete && img.naturalWidth === 0 && src && !src.startsWith('data:')) {
      out.brokenImages.push({ src: src.slice(0, 120), selector: shortSelector(img) });
    }
    if (img.getAttribute('alt') === null) out.missingAlt.push(shortSelector(img));
  }

  // ── I. LAYOUT (horizontal overflow, non-scroller only) ───────────────────
  const docEl = document.documentElement;
  out.overflowDelta = docEl.scrollWidth - docEl.clientWidth;
  const overflowing = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.position === 'fixed') continue;
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1 || r.left < -1) overflowing.push({ el, r });
  }
  let offCount = 0;
  for (const o of overflowing) {
    const parent = o.el.parentElement;
    if (parent && overflowing.some((p) => p.el === parent)) continue;
    let anc = o.el.parentElement;
    let inScroller = false;
    while (anc && anc !== document.body) {
      const acs = getComputedStyle(anc);
      if (acs.overflowX === 'auto' || acs.overflowX === 'scroll' || acs.overflowX === 'hidden') { inScroller = true; break; }
      anc = anc.parentElement;
    }
    if (inScroller) continue;
    out.overflowOffenders.push({
      selector: shortSelector(o.el),
      tag: o.el.tagName.toLowerCase(),
      width: Math.round(o.r.width),
      left: Math.round(o.r.left),
      text: label(o.el, 40),
    });
    if (++offCount >= 6) break;
  }

  // ── Global structure ───────────────────────────────────────────────────────
  const ids = new Map();
  for (const el of document.querySelectorAll('[id]')) {
    const id = el.id;
    if (!id) continue;
    ids.set(id, (ids.get(id) || 0) + 1);
  }
  out.duplicateIds = [...ids.entries()].filter(([, n]) => n > 1).map(([id, n]) => `${id}×${n}`).slice(0, 8);

  let prevLevel = 0;
  const skips = [];
  for (const h of document.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
    const level = Number(h.tagName[1]);
    if (prevLevel && level > prevLevel + 1) {
      skips.push(`H${level} "${label(h, 40)}" after H${prevLevel || 0}`);
      if (skips.length >= 6) break;
    }
    prevLevel = level;
  }
  out.headingSkips = skips;

  if (!document.title || !document.title.trim()) out.docIssues.push('missing <title>');
  if (!document.documentElement.getAttribute('lang')) out.docIssues.push('missing <html lang>');
  if (device.mobile && !document.querySelector('meta[name="viewport"]')) out.docIssues.push('missing viewport meta');

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Runner
// ─────────────────────────────────────────────────────────────────────────────
// Vercel Analytics/SpeedInsights scripts only exist on Vercel's infra — locally they
// 404 and get CORS-refused on every page. Environment artifact, never a product bug.
const IGNORED_URL_RE = /supabase\.co|sentry|google-analytics|posthog|razorpay\.com\/v\/1\/checkout|fonts\.gstatic|gstatic\.com|\/_vercel\/(insights|speed-insights)/;
const isIgnored = (url) => IGNORED_URL_RE.test(url);

async function auditOne(browser, route, device) {
  const context = await browser.newContext({
    viewport: { width: device.width, height: device.height },
    deviceScaleFactor: device.dpr,
    isMobile: device.mobile,
    hasTouch: device.mobile,
    userAgent: device.mobile
      ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      : undefined,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error' && !isIgnored(msg.location()?.url || '')) {
      consoleErrors.push(msg.text().slice(0, 200));
    }
  });
  page.on('pageerror', (err) => pageErrors.push(String(err.message || err).slice(0, 200)));
  page.on('requestfailed', (req) => {
    if (isIgnored(req.url())) return;
    failedRequests.push({ url: req.url().slice(0, 140), reason: req.failure()?.errorText || 'unknown' });
  });
  page.on('response', (res) => {
    if (res.status() < 400 || isIgnored(res.url())) return;
    failedRequests.push({ url: res.url().slice(0, 140), status: res.status() });
  });

  let httpStatus = null;
  try {
    const response = await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    httpStatus = response?.status() ?? null;
    await page.waitForFunction(() => !document.getElementById('boot-overlay'), { timeout: 15000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.evaluate(async () => {
      const step = window.innerHeight;
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 70));
      }
      window.scrollTo(0, 0);
      await new Promise((r) => setTimeout(r, 200));
    });
    await page.waitForTimeout(250);
  } catch (err) {
    pageErrors.push(`navigation: ${String(err.message || err).slice(0, 200)}`);
  }

  let audit = null;
  try {
    audit = await page.evaluate(inPageAudit, { mobile: device.mobile });
  } catch (err) {
    pageErrors.push(`audit-eval: ${String(err.message || err).slice(0, 200)}`);
  }

  // E: verify internal links resolve (once per page, on the desktop pass).
  let linkChecks = null;
  if (device.name === 'desktop-1280' && audit?.internalLinks?.length) {
    linkChecks = [];
    const targets = audit.internalLinks.slice(0, 40);
    for (const link of targets) {
      try {
        const res = await page.request.get(`${BASE}${link}`, { maxRedirects: 3 });
        const ok = res.status() < 400;
        if (!ok) linkChecks.push({ link, status: res.status() });
      } catch {
        linkChecks.push({ link, status: 'ERR' });
      }
    }
  }

  await context.close();

  return {
    route,
    device: device.name,
    httpStatus,
    consoleErrors: consoleErrors.slice(0, 5),
    pageErrors: pageErrors.slice(0, 5),
    failedRequests: failedRequests.slice(0, 5),
    ...audit,
    linkChecks,
  };
}

async function runPool(items, worker, concurrency) {
  const results = [];
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
  return results;
}

function issueCount(r) {
  return (
    (r.pageErrors?.length || 0) +
    (r.consoleErrors?.length || 0) +
    (r.badText?.length || 0) +
    (r.badCurrency?.length || 0) +
    (r.clippedText?.length || 0) +
    (r.genericButtons?.length || 0) +
    (r.hreflessLinks?.length || 0) +
    (r.unnamedInteractive?.length || 0) +
    (r.badPlaceholders?.length || 0) +
    (r.unlabeledInputs?.length || 0) +
    (r.externalLinkIssues?.length || 0) +
    (r.linkChecks?.length || 0) +
    (r.brokenImages?.length || 0) +
    (r.overflowOffenders?.length || 0) +
    (r.duplicateIds?.length || 0) +
    (r.headingSkips?.length || 0) +
    (r.docIssues?.length || 0)
  );
}

function summarize(results) {
  const by = (k) =>
    Object.entries(
      results.reduce((acc, r) => {
        for (const item of r[k] || []) {
          const key = typeof item === 'string' ? item : item.selector || item.href || item.text || JSON.stringify(item);
          acc[key] = (acc[key] || 0) + 1;
        }
        return acc;
      }, {})
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 25);

  return {
    loads: results.length,
    routes: [...new Set(results.map((r) => r.route))].length,
    pageErrors: results.filter((r) => r.pageErrors?.length).map((r) => ({ route: r.route, device: r.device, errors: r.pageErrors })),
    consoleErrors: results.filter((r) => r.consoleErrors?.length).map((r) => ({ route: r.route, device: r.device, errors: r.consoleErrors })),
    badText: by('badText'),
    badCurrency: by('badCurrency'),
    clippedText: by('clippedText'),
    genericButtons: by('genericButtons'),
    hreflessLinks: by('hreflessLinks'),
    unnamedInteractive: by('unnamedInteractive'),
    badPlaceholders: by('badPlaceholders'),
    unlabeledInputs: by('unlabeledInputs'),
    externalLinkIssues: by('externalLinkIssues'),
    brokenLinks: results.flatMap((r) => (r.linkChecks || []).map((l) => ({ from: r.route, ...l }))).slice(0, 40),
    brokenImages: by('brokenImages'),
    overflowOffenders: by('overflowOffenders'),
    duplicateIds: by('duplicateIds'),
    headingSkips: [...new Set(results.flatMap((r) => r.headingSkips || []))],
    docIssues: by('docIssues'),
    httpFailures: results.filter((r) => r.httpStatus && r.httpStatus >= 400).map((r) => ({ route: r.route, status: r.httpStatus, device: r.device })),
  };
}

async function main() {
  const exec = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
  if (!exec) throw new Error('No Chrome binary found');
  const routes = GROUP === 'all' ? Object.values(ROUTE_GROUPS).flat() : ROUTE_GROUPS[GROUP];
  if (!routes) throw new Error(`Unknown group: ${GROUP}`);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({
    executablePath: exec,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const jobs = [];
  VIEWPORTS.forEach((device) => routes.forEach((route) => jobs.push({ route, device })));
  console.log(`▶ element-audit[${GROUP}] · ${routes.length} routes × ${VIEWPORTS.length} viewports = ${jobs.length} loads (concurrency ${CONCURRENCY})`);

  let done = 0;
  const results = await runPool(
    jobs,
    async (job) => {
      const r = await auditOne(browser, job.route, job.device);
      done++;
      const n = issueCount(r);
      console.log(`  [${done}/${jobs.length}] ${job.route.padEnd(38)} ${job.device.name.padEnd(12)} ${n ? `⚠ ${n} issue(s)` : 'ok'}`);
      return r;
    },
    CONCURRENCY
  );

  await browser.close();

  const summary = summarize(results);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const jsonPath = path.join(OUT_DIR, `${PREFIX}-${GROUP}-${stamp}.json`);
  const mdPath = path.join(OUT_DIR, `${PREFIX}-${GROUP}-${stamp}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify({ base: BASE, group: GROUP, generatedAt: new Date().toISOString(), summary, results }, null, 2));

  const lines = [
    `# Growlancer element audit — ${GROUP}`,
    `Base: ${BASE} · ${summary.routes} routes × ${VIEWPORTS.length} viewports = ${summary.loads} loads`,
    '',
    `## Page/console errors: ${summary.pageErrors.length + summary.consoleErrors.length}`,
    ...[...summary.pageErrors, ...summary.consoleErrors].map((e) => `- ${e.route} [${e.device}]: ${JSON.stringify(e.errors).slice(0, 160)}`),
    '',
    `## Leftover/placeholder text: ${summary.badText.length} unique`,
    ...summary.badText.map(([k, n]) => `- ${n}× ${k}`),
    '',
    `## Wrong/broken currency: ${summary.badCurrency.length} unique`,
    ...summary.badCurrency.map(([k, n]) => `- ${n}× ${k}`),
    '',
    `## Silently clipped text (mobile): ${summary.clippedText.length} unique`,
    ...summary.clippedText.map(([k, n]) => `- ${n}× ${k}`),
    '',
    `## Generic button labels: ${summary.genericButtons.length} unique`,
    ...summary.genericButtons.map(([k, n]) => `- ${n}× ${k}`),
    '',
    `## Unnamed interactive (icon-only a11y): ${summary.unnamedInteractive.length} unique`,
    ...summary.unnamedInteractive.map(([k, n]) => `- ${n}× ${k}`),
    '',
    `## Bad placeholders: ${summary.badPlaceholders.length} unique`,
    ...summary.badPlaceholders.map(([k, n]) => `- ${n}× ${k}`),
    '',
    `## Inputs without label: ${summary.unlabeledInputs.length} unique`,
    ...summary.unlabeledInputs.map(([k, n]) => `- ${n}× ${k}`),
    '',
    `## External link issues: ${summary.externalLinkIssues.length} unique`,
    ...summary.externalLinkIssues.map(([k, n]) => `- ${n}× ${k}`),
    '',
    `## Broken internal links (4xx): ${summary.brokenLinks.length}`,
    ...summary.brokenLinks.map((l) => `- ${l.from} → ${l.link} (${l.status})`),
    '',
    `## Broken images: ${summary.brokenImages.length} unique`,
    ...summary.brokenImages.map(([k, n]) => `- ${n}× ${k}`),
    '',
    `## Overflow offenders (non-scroller): ${summary.overflowOffenders.length} unique`,
    ...summary.overflowOffenders.map(([k, n]) => `- ${n}× ${k}`),
    '',
    `## Duplicate ids: ${summary.duplicateIds.length} unique`,
    ...summary.duplicateIds.map(([k, n]) => `- ${n}× ${k}`),
    '',
    `## Heading skips: ${summary.headingSkips.length}`,
    ...summary.headingSkips.map((s) => `- ${s}`),
    '',
    `## Doc issues (title/lang/viewport): ${summary.docIssues.length} unique`,
    ...summary.docIssues.map(([k, n]) => `- ${n}× ${k}`),
    '',
    `## HTTP failures: ${summary.httpFailures.length}`,
    ...summary.httpFailures.map((f) => `- ${f.route} [${f.device}] ${f.status}`),
  ];
  fs.writeFileSync(mdPath, lines.join('\n') + '\n');

  const total = results.reduce((s, r) => s + issueCount(r), 0);
  console.log(`\n✔ ${summary.loads} loads, ${total} raw issue flags`);
  console.log(`Artifacts:\n  ${mdPath}\n  ${jsonPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
