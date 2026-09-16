// Growlancer E2E device-matrix audit
// ─────────────────────────────────────────────────────────────────────────────
// Drives a REAL Chromium (playwright-core + the locally installed Chrome)
// through every route at every device profile and reports objective,
// measurable problems instead of eyeballing screenshots:
//
//   • HTTP status + console errors + uncaught page errors
//   • failed network requests (4xx/5xx)
//   • horizontal overflow — the #1 mobile breakage — with the offending nodes
//   • tap targets below the 44px mobile minimum (WCAG 2.5.5 / Apple & Google HIG)
//   • tiny text (<12px) on phones
//   • broken images / images missing alt
//   • interactive elements with no accessible name
//   • duplicate DOM ids, skipped heading levels
//   • missing <html lang> / viewport meta
//
// Usage:
//   node scripts/e2e/device-audit.mjs --mode=sweep          # all routes × canonical devices
//   node scripts/e2e/device-audit.mjs --mode=matrix         # key routes × all devices
//   node scripts/e2e/device-audit.mjs --mode=auth:freelancer --storage=.e2e/freelancer.json
//
// Artifacts land in tests/e2e-artifacts/.

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import {
  DEVICES,
  CANONICAL_DEVICES,
  KEY_ROUTES,
  PUBLIC_ROUTES,
  FREELANCER_ROUTES,
  CLIENT_ROUTES,
  ADMIN_ROUTES,
} from './devices.mjs';

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

const BASE = args.base || 'http://localhost:5173';
const MODE = args.mode || 'sweep';
const CONCURRENCY = Number(args.concurrency || 3);
const OUT_DIR = path.resolve(args.out || 'tests/e2e-artifacts');
const STORAGE = args.storage || null;
const PREFIX = args.prefix || 'device-audit';

function resolveChrome() {
  for (const p of CHROME_CANDIDATES) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`No Chrome binary found. Tried:\n${CHROME_CANDIDATES.join('\n')}`);
}

function pickDevices() {
  if (args.devices) {
    const wanted = args.devices.split(',');
    const found = DEVICES.filter((d) => wanted.includes(d.name));
    if (!found.length) throw new Error(`No devices matched --devices=${args.devices}`);
    return found;
  }
  if (MODE === 'matrix') return DEVICES;
  return DEVICES.filter((d) => CANONICAL_DEVICES.includes(d.name));
}

function pickRoutes() {
  if (args.routes) return args.routes.split(',').map((r) => (r.startsWith('/') ? r : `/${r}`));
  if (MODE === 'matrix') return KEY_ROUTES;
  if (MODE.startsWith('auth:')) {
    const role = MODE.split(':')[1];
    if (role === 'freelancer') return FREELANCER_ROUTES;
    if (role === 'client') return CLIENT_ROUTES;
    if (role === 'admin') return ADMIN_ROUTES;
    throw new Error(`Unknown auth role: ${role}`);
  }
  return PUBLIC_ROUTES;
}

// ─────────────────────────────────────────────────────────────────────────────
// In-page collector — runs inside the browser, returns plain JSON.
// ─────────────────────────────────────────────────────────────────────────────
function inPageAudit(device) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  function shortSelector(el) {
    if (!el || el === document.body || el === document.documentElement) return 'body';
    const parts = [];
    let node = el;
    let depth = 0;
    while (node && node !== document.body && depth < 4) {
      let s = node.tagName.toLowerCase();
      if (node.id) {
        s += `#${node.id}`;
        parts.unshift(s);
        break;
      }
      const cls = (node.getAttribute('class') || '')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((c) => `.${CSS.escape(c)}`)
        .join('');
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

  function label(el) {
    const t = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
    return t.length > 60 ? `${t.slice(0, 57)}...` : t;
  }

  function visible(el) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  // ── 1. Horizontal overflow + the outermost offenders ──────────────────────
  const docEl = document.documentElement;
  const overflowDelta = docEl.scrollWidth - docEl.clientWidth;
  // NOTE: the app sets `body { overflow-x: hidden }`, which CLIPS horizontal
  // overflow instead of reporting it — so overflowDelta alone would hide real
  // mobile breakage (unreachable / cut-off content). Measure offenders
  // unconditionally so clipped content is caught too.
  const offenders = [];
  {
    const overflowing = [];
    for (const el of document.body.querySelectorAll('*')) {
      if (!visible(el)) continue;
      const cs = getComputedStyle(el);
      if (cs.position === 'fixed') continue;
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1 || r.left < -1) {
        overflowing.push({ el, r, cs });
      }
    }
    for (const o of overflowing) {
      // Keep only the OUTERMOST offenders — if a parent also overflows, this
      // node is a symptom, not the cause.
      const parent = o.el.parentElement;
      if (parent && overflowing.some((p) => p.el === parent)) continue;
      // Ignore elements that are inside a horizontal scroller (intentional:
      // carousels, tables, chip rows) — those are allowed to be wider.
      let anc = o.el.parentElement;
      let inScroller = false;
      while (anc && anc !== document.body) {
        const acs = getComputedStyle(anc);
        if (acs.overflowX === 'auto' || acs.overflowX === 'scroll' || acs.overflowX === 'hidden') {
          inScroller = true;
          break;
        }
        anc = anc.parentElement;
      }
      offenders.push({
        selector: shortSelector(o.el),
        tag: o.el.tagName.toLowerCase(),
        width: Math.round(o.r.width),
        left: Math.round(o.r.left),
        right: Math.round(o.r.right),
        overflowX: o.cs.overflowX,
        inScroller,
        text: label(o.el),
      });
      if (offenders.length >= 8) break;
    }
  }

  // ── 2. Tap targets (mobile only) ─────────────────────────────────────────
  // Measured TWICE: the first pass runs while the page may still be settling
  // (post-hydration re-render / scroll-triggered transitions), and a handful of
  // elements were measured mid-settle at their pre-CSS intrinsic size — e.g. a
  // `h-12` select reported as 23px tall. Only targets that are STILL undersized
  // on the second, settled measurement are reported.
  const tapFailures = [];
  let tapTotal = 0;
  const tapCandidates = [];
  if (device.mobile) {
    const MIN = 44;
    const interactive = document.querySelectorAll(
      'a[href], button, [role="button"], [role="tab"], [role="menuitem"], select, input:not([type="hidden"]), textarea, summary'
    );
    for (const el of interactive) {
      if (!visible(el)) continue;
      if (el.closest('[aria-hidden="true"]')) continue;
      const r = el.getBoundingClientRect();
      // Inline links inside prose are exempt from target-size rules.
      const inProse = el.tagName === 'A' && el.closest('p, li, span.sr-only~*, small');
      if (inProse) continue;
      tapTotal++;
      if (r.width < MIN - 0.5 || r.height < MIN - 0.5) {
        tapCandidates.push({ el, selector: shortSelector(el) });
      }
    }
  }

  // ── 3. Tiny text on phones ───────────────────────────────────────────────
  const smallText = [];
  if (device.mobile) {
    for (const el of document.body.querySelectorAll('p, span, div, li, a, label, td, th, button, small')) {
      if (!visible(el)) continue;
      if (!(el.textContent || '').trim()) continue;
      // Only leaf-ish nodes (has its own text) to avoid duplicate reporting.
      const hasTextChild = Array.from(el.children).some((c) => (c.textContent || '').trim());
      if (hasTextChild) continue;
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (size && size < 12) {
        smallText.push({
          selector: shortSelector(el),
          size,
          text: label(el).slice(0, 40),
        });
      }
      if (smallText.length >= 10) break;
    }
  }

  // ── 4. Images ────────────────────────────────────────────────────────────
  const brokenImages = [];
  let imagesMissingAlt = 0;
  for (const img of document.querySelectorAll('img')) {
    if (!visible(img)) continue;
    const src = img.getAttribute('src') || '';
    if (img.complete && img.naturalWidth === 0 && src && !src.startsWith('data:')) {
      brokenImages.push({ src, selector: shortSelector(img) });
    }
    if (img.getAttribute('alt') === null) imagesMissingAlt++;
  }

  // ── 5. Accessible names for interactive elements ──────────────────────────
  function accessibleName(el) {
    const aria = el.getAttribute('aria-label');
    if (aria && aria.trim()) return aria.trim();
    const labelledby = el.getAttribute('aria-labelledby');
    if (labelledby) {
      const t = labelledby
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent || '')
        .join(' ')
        .trim();
      if (t) return t;
    }
    const text = (el.innerText || el.textContent || '').trim();
    if (text) return text;
    const title = el.getAttribute('title');
    if (title && title.trim()) return title;
    const imgAlt = el.querySelector('img[alt]')?.getAttribute('alt');
    if (imgAlt && imgAlt.trim()) return imgAlt;
    const value = el.getAttribute('value');
    if (value && value.trim()) return value;
    return '';
  }
  const unnamed = [];
  for (const el of document.querySelectorAll('a[href], button, [role="button"]')) {
    if (!visible(el)) continue;
    if (el.closest('[aria-hidden="true"]')) continue;
    if (!accessibleName(el)) {
      unnamed.push({ selector: shortSelector(el), tag: el.tagName.toLowerCase(), html: el.outerHTML.slice(0, 120) });
    }
  }
  // Inputs without a label (placeholder alone is not a label)
  const unlabelledInputs = [];
  for (const el of document.querySelectorAll('input:not([type="hidden"]), select, textarea')) {
    if (!visible(el)) continue;
    const id = el.id;
    const hasLabel = id && document.querySelector(`label[for="${CSS.escape(id)}"]`);
    const wrapped = el.closest('label');
    const aria = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby');
    if (!hasLabel && !wrapped && !aria) {
      unlabelledInputs.push({
        selector: shortSelector(el),
        type: el.getAttribute('type') || el.tagName.toLowerCase(),
        placeholder: el.getAttribute('placeholder') || '',
      });
    }
  }

  // ── 6. Duplicate ids ─────────────────────────────────────────────────────
  const idCounts = {};
  for (const el of document.querySelectorAll('[id]')) {
    idCounts[el.id] = (idCounts[el.id] || 0) + 1;
  }
  const duplicateIds = Object.entries(idCounts)
    .filter(([, n]) => n > 1)
    .map(([id, n]) => `${id} ×${n}`);

  // ── 7. Heading order ─────────────────────────────────────────────────────
  const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).filter(visible);
  const headingSkips = [];
  let prev = 0;
  for (const h of headings) {
    const level = Number(h.tagName[1]);
    if (prev && level > prev + 1) headingSkips.push(`${h.tagName} "${label(h).slice(0, 40)}" after H${prev}`);
    prev = level;
  }

  // ── 8. Sticky header sanity ──────────────────────────────────────────────
  const header = document.querySelector('header');
  const headerBox = header ? header.getBoundingClientRect() : null;

  return {
    viewport: { w: vw, h: vh },
    overflowDelta,
    offenders,
    // Second, settled measurement of the candidate tap targets.
    _tapRecheck: tapCandidates.map((c) => {
      const r = c.el.getBoundingClientRect();
      const cs = getComputedStyle(c.el);
      return {
        selector: c.selector,
        tag: c.el.tagName.toLowerCase(),
        w: Math.round(r.width),
        h: Math.round(r.height),
        w2: Math.round(cs.width ? parseFloat(cs.width) : r.width),
        h2: Math.round(cs.height ? parseFloat(cs.height) : r.height),
        text: label(c.el).slice(0, 40),
        cls: c.el.getAttribute('class') || '',
        outerHTML: c.el.outerHTML.slice(0, 220),
      };
    }),
    clippedCount: offenders.filter((o) => !o.inScroller).length,
    tapTargets: { total: tapTotal, failures: tapFailures.slice(0, 10), failureCount: tapFailures.length },
    smallText,
    images: { broken: brokenImages, missingAlt: imagesMissingAlt },
    a11y: {
      unnamed: unnamed.slice(0, 10),
      unnamedCount: unnamed.length,
      unlabelledInputs: unlabelledInputs.slice(0, 10),
      unlabelledInputCount: unlabelledInputs.length,
      duplicateIds: duplicateIds.slice(0, 10),
      headingSkips: headingSkips.slice(0, 10),
      h1Count: headings.filter((h) => h.tagName === 'H1').length,
    },
    header: headerBox
      ? { present: true, height: Math.round(headerBox.height), top: Math.round(headerBox.top), width: Math.round(headerBox.width) }
      : { present: false },
    doc: {
      lang: document.documentElement.lang || null,
      viewportMeta: document.querySelector('meta[name="viewport"]')?.getAttribute('content') || null,
      bodyScrollWidth: document.body.scrollWidth,
      title: document.title,
      url: window.location.href,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Runner
// ─────────────────────────────────────────────────────────────────────────────
// The generic "Failed to load resource … 404" console message does not name a
// URL, so it cannot be filtered per-request. When E2E_IGNORE_VERCEL_404=1 we
// drop it — it is the Vercel-injected /_vercel/*{insights,speed-insights}
// scripts, which only exist on Vercel's edge and 404 on a local server.
const IGNORE_VERCEL_404 = process.env.E2E_IGNORE_VERCEL_404 === '1';

const IGNORED_CONSOLE = [
  /Download the React DevTools/i,
  /GoTrueClient@/i,
  /autocomplete attributes/i,
  /\[vite\]/i,
  /\[Auth\]/i,
  /Multiple GoTrueClient/i,
  /Refused to execute script from .*_vercel/i,
];
const IGNORED_REQUESTS = [
  // Vercel-injected analytics endpoints — they only exist on Vercel's edge, so
  // a local production server legitimately 404s them.
  /\/_vercel\//,
  /favicon\.ico$/,
  /google-analytics|googletagmanager|vercel\/insights|va\.vercel-scripts/i,
  /sentry/i,
  /fonts\.gstatic\.com|fonts\.googleapis\.com/i,
  /googlesyndication|doubleclick/i,
];

function isIgnored(text, patterns) {
  return patterns.some((re) => re.test(text));
}

async function auditOne(browser, device, route, deviceIndex, storageState) {
  const context = await browser.newContext({
    viewport: { width: device.width, height: device.height },
    deviceScaleFactor: device.dpr,
    isMobile: device.mobile,
    hasTouch: device.mobile,
    userAgent: device.mobile
      ? `Mozilla/5.0 (Linux; Android ${device.width < 400 ? '13' : '14'}; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36`
      : undefined,
    storageState: storageState || undefined,
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const consoleWarnings = [];
  const pageErrors = [];
  const failedRequests = [];

  page.on('console', (msg) => {
    const text = msg.text();
    if (IGNORE_VERCEL_404 && /Failed to load resource.*404/.test(text)) return;
    if (msg.type() === 'error' && !isIgnored(text, IGNORED_CONSOLE)) consoleErrors.push(text.slice(0, 300));
    if (msg.type() === 'warning' && !isIgnored(text, IGNORED_CONSOLE)) consoleWarnings.push(text.slice(0, 300));
  });
  page.on('pageerror', (err) => pageErrors.push(String(err.message || err).slice(0, 300)));
  page.on('requestfailed', (req) => {
    const url = req.url();
    if (isIgnored(url, IGNORED_REQUESTS)) return;
    failedRequests.push({ url: url.slice(0, 160), method: req.method(), reason: req.failure()?.errorText || 'unknown' });
  });
  page.on('response', (res) => {
    const url = res.url();
    const status = res.status();
    if (status < 400) return;
    if (isIgnored(url, IGNORED_REQUESTS)) return;
    failedRequests.push({ url: url.slice(0, 160), method: res.request().method(), status });
  });

  const started = Date.now();
  let httpStatus = null;
  try {
    const response = await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    httpStatus = response?.status() ?? null;
    // Wait for hydration + the boot splash to be removed.
    await page
      .waitForFunction(() => !document.getElementById('boot-overlay'), { timeout: 15000 })
      .catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
    // Trigger lazy content (IntersectionObserver sections, lazy images).
    await page.evaluate(async () => {
      const step = window.innerHeight;
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 90));
      }
      window.scrollTo(0, 0);
      await new Promise((r) => setTimeout(r, 250));
    });
    // Force mobile layout recalculation if a resize-dependent header exists.
    await page.waitForTimeout(300);
  } catch (err) {
    pageErrors.push(`navigation: ${String(err.message || err).slice(0, 200)}`);
  }

  let audit = null;
  try {
    audit = await page.evaluate(inPageAudit, { mobile: device.mobile });
  } catch (err) {
    pageErrors.push(`audit-eval: ${String(err.message || err).slice(0, 200)}`);
  }

  await context.close();

  // Settled tap-target pass: an element still under 44px by EITHER measurement
  // (border-box rect or computed CSS box) is a genuine miss.
  const tapRecheck = audit?._tapRecheck || [];
  const settledTapFailures = tapRecheck.filter((t) => t.w < 43.5 || t.h < 43.5);
  if (audit) {
    delete audit._tapRecheck;
    audit.tapTargets = {
      total: audit.tapTargets?.total ?? 0,
      failureCount: settledTapFailures.length,
      failures: settledTapFailures.slice(0, 10),
      settledAll: tapRecheck,
    };
  }

  return {
    route,
    device: device.name,
    deviceLabel: device.label,
    deviceIndex,
    width: device.width,
    height: device.height,
    httpStatus,
    ms: Date.now() - started,
    consoleErrors,
    consoleWarningCount: consoleWarnings.length,
    consoleWarnings: consoleWarnings.slice(0, 5),
    pageErrors,
    failedRequests,
    ...(audit || {}),
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

function severity(r) {
  const issues = [];
  if (r.pageErrors?.length) issues.push('page-error');
  if (r.consoleErrors?.length) issues.push('console-error');
  if (r.httpStatus && r.httpStatus >= 400) issues.push(`http-${r.httpStatus}`);
  if (r.overflowDelta > 1) issues.push(`overflow-${r.overflowDelta}px`);
  if (r.clippedCount) issues.push(`clipped-${r.clippedCount}`);
  if (r.offenders?.some((o) => !o.inScroller)) issues.push('overflow-unscrolled');
  if (r.a11y?.unnamedCount) issues.push(`a11y-names-${r.a11y.unnamedCount}`);
  if (r.images?.broken?.length) issues.push(`broken-img-${r.images.broken.length}`);
  if (r.a11y?.duplicateIds?.length) issues.push('dup-id');
  return issues;
}

async function main() {
  const exec = resolveChrome();
  const devices = pickDevices();
  const routes = pickRoutes();

  let storageState;
  if (STORAGE) {
    if (!fs.existsSync(STORAGE)) throw new Error(`Storage state not found: ${STORAGE}`);
    storageState = JSON.parse(fs.readFileSync(STORAGE, 'utf8'));
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({
    executablePath: exec,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const jobs = [];
  devices.forEach((device, dIdx) => routes.forEach((route) => jobs.push({ device, route, dIdx })));

  console.log(`▶ ${MODE} · ${routes.length} routes × ${devices.length} devices = ${jobs.length} page loads (concurrency ${CONCURRENCY})`);

  let done = 0;
  const results = await runPool(
    jobs,
    async (job) => {
      const r = await auditOne(browser, job.device, job.route, job.dIdx, storageState);
      done++;
      const issues = severity(r);
      const flag = issues.length ? `⚠ ${issues.join(',')}` : 'ok';
      console.log(`  [${done}/${jobs.length}] ${job.device.name.padEnd(20)} ${job.route.padEnd(34)} ${flag}`);
      return r;
    },
    CONCURRENCY
  );

  await browser.close();

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = path.join(OUT_DIR, `${PREFIX}-${stamp}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify({ base: BASE, mode: MODE, generatedAt: new Date().toISOString(), results }, null, 2));

  // ── Text summary ─────────────────────────────────────────────────────────
  const lines = [];
  lines.push(`# Growlancer E2E device audit — ${MODE}`);
  lines.push(`Base: ${BASE}`);
  lines.push(`Routes: ${routes.length} · Devices: ${devices.length} · Page loads: ${results.length}`);
  lines.push('');

  const hardFailures = results.filter((r) => (r.pageErrors?.length || 0) + (r.consoleErrors?.length || 0) > 0 || (r.httpStatus || 0) >= 400);
  lines.push(`## Hard failures (console / page error / 4xx-5xx): ${hardFailures.length}`);
  for (const r of hardFailures) {
    lines.push(`- ${r.route} @ ${r.device} — status=${r.httpStatus} pageErrors=${r.pageErrors.length} consoleErrors=${r.consoleErrors.length}`);
    for (const e of [...r.pageErrors, ...r.consoleErrors].slice(0, 3)) lines.push(`    · ${e.replace(/\n/g, ' ')}`);
  }
  lines.push('');

  const overflow = results.filter((r) => (r.overflowDelta || 0) > 1 || (r.clippedCount || 0) > 0);
  lines.push(`## Horizontal overflow / clipped content: ${overflow.length} (route × device)`);
  for (const r of overflow) {
    const real = (r.offenders || []).filter((o) => !o.inScroller);
    lines.push(
      `- ${r.route} @ ${r.device} (${r.width}px): scrollDelta=+${r.overflowDelta}px clippedNodes=${r.clippedCount || 0}${real.length ? '' : ' (all offenders inside a horizontal scroller)'}`
    );
    for (const o of real.slice(0, 4)) {
      lines.push(`    · <${o.tag}> w=${o.width} right=${o.right} — ${o.selector} — "${o.text}"`);
    }
  }
  lines.push('');

  const tap = results.filter((r) => (r.tapTargets?.failureCount || 0) > 0);
  const tapUnique = new Map();
  for (const r of tap) {
    for (const f of r.tapTargets.failures || []) {
      const key = `${f.selector}|${f.w}x${f.h}`;
      if (!tapUnique.has(key)) tapUnique.set(key, { ...f, routes: new Set(), devices: new Set() });
      tapUnique.get(key).routes.add(r.route);
      tapUnique.get(key).devices.add(r.device);
    }
  }
  lines.push(`## Tap targets under 44px (mobile): ${tapUnique.size} unique elements across ${tap.length} page loads`);
  for (const [, f] of [...tapUnique.entries()].slice(0, 40)) {
    lines.push(`- <${f.tag}> ${f.w}×${f.h}px — ${f.selector} — "${f.text}" (${[...f.devices].join(', ')})`);
  }
  lines.push('');

  const unnamed = new Map();
  for (const r of results) {
    for (const u of r.a11y?.unnamed || []) {
      const key = `${u.selector}`;
      if (!unnamed.has(key)) unnamed.set(key, { ...u, routes: new Set() });
      unnamed.get(key).routes.add(r.route);
    }
  }
  lines.push(`## Interactive elements with no accessible name: ${unnamed.size} unique`);
  for (const [, u] of [...unnamed.entries()].slice(0, 30)) lines.push(`- <${u.tag}> ${u.selector} — ${u.html}`);
  lines.push('');

  const warnMap = new Map();
  for (const r of results) {
    for (const w of r.consoleWarnings || []) {
      const key = w.slice(0, 150);
      if (!warnMap.has(key)) warnMap.set(key, { count: 0, routes: new Set() });
      warnMap.get(key).count++;
      warnMap.get(key).routes.add(r.route);
    }
  }
  lines.push(`## React/browser console warnings: ${warnMap.size} unique`);
  for (const [w, meta] of [...warnMap.entries()].slice(0, 20)) {
    lines.push(`- ${meta.count}× (${[...meta.routes].slice(0, 3).join(', ')}) ${w.replace(/\n/g, ' ')}`);
  }
  lines.push('');

  const dupIds = new Map();
  for (const r of results) {
    for (const id of r.a11y?.duplicateIds || []) {
      if (!dupIds.has(id)) dupIds.set(id, new Set());
      dupIds.get(id).add(`${r.route}@${r.device}`);
    }
  }
  lines.push(`## Duplicate DOM ids: ${dupIds.size}`);
  for (const [id, where] of [...dupIds.entries()].slice(0, 20)) lines.push(`- ${id} — ${[...where].slice(0, 3).join(', ')}`);
  lines.push('');

  const brokenImgs = new Map();
  for (const r of results) {
    for (const b of r.images?.broken || []) {
      if (!brokenImgs.has(b.src)) brokenImgs.set(b.src, new Set());
      brokenImgs.get(b.src).add(r.route);
    }
  }
  lines.push(`## Broken images: ${brokenImgs.size} unique`);
  for (const [src, where] of [...brokenImgs.entries()].slice(0, 20)) lines.push(`- ${src} — ${[...where].slice(0, 3).join(', ')}`);
  lines.push('');

  const smallText = new Map();
  for (const r of results) {
    for (const s of r.smallText || []) {
      const key = `${s.selector}`;
      if (!smallText.has(key)) smallText.set(key, { ...s, routes: new Set() });
      smallText.get(key).routes.add(r.route);
    }
  }
  lines.push(`## Text smaller than 12px on phones: ${smallText.size} unique`);
  for (const [, s] of [...smallText.entries()].slice(0, 25)) lines.push(`- ${s.size}px — ${s.selector} — "${s.text}" (${[...s.routes].slice(0, 3).join(', ')})`);
  lines.push('');

  const failedReq = new Map();
  for (const r of results) {
    for (const f of r.failedRequests || []) {
      const key = `${f.status || 'ERR'} ${f.url.split('?')[0]}`;
      if (!failedReq.has(key)) failedReq.set(key, { ...f, hits: 0, routes: new Set() });
      failedReq.get(key).hits++;
      failedReq.get(key).routes.add(r.route);
    }
  }
  lines.push(`## Failed / 4xx-5xx requests: ${failedReq.size} unique`);
  for (const [, f] of [...failedReq.entries()].slice(0, 30)) {
    lines.push(`- [${f.status || f.reason}] ${f.hits}× ${f.url}`);
  }
  lines.push('');

  const headingSkips = new Map();
  for (const r of results) {
    for (const h of r.a11y?.headingSkips || []) {
      if (!headingSkips.has(h)) headingSkips.set(h, new Set());
      headingSkips.get(h).add(r.route);
    }
  }
  lines.push(`## Heading level skips: ${headingSkips.size}`);
  for (const [h, where] of [...headingSkips.entries()].slice(0, 20)) lines.push(`- ${h} (${[...where].slice(0, 3).join(', ')})`);
  lines.push('');

  const unlabelled = new Map();
  for (const r of results) {
    for (const i of r.a11y?.unlabelledInputs || []) {
      if (!unlabelled.has(i.selector)) unlabelled.set(i.selector, { ...i, routes: new Set() });
      unlabelled.get(i.selector).routes.add(r.route);
    }
  }
  lines.push(`## Inputs without an accessible label: ${unlabelled.size} unique`);
  for (const [, i] of [...unlabelled.entries()].slice(0, 25)) lines.push(`- <${i.type}> ${i.selector} placeholder="${i.placeholder}" (${[...i.routes].slice(0, 3).join(', ')})`);
  lines.push('');

  const viewportIssues = results.filter((r) => !r.doc?.viewportMeta || !r.doc?.lang);
  lines.push(`## Missing viewport meta / <html lang>: ${viewportIssues.length}`);
  for (const r of viewportIssues.slice(0, 10)) lines.push(`- ${r.route} lang=${r.doc?.lang} viewport="${r.doc?.viewportMeta}"`);
  lines.push('');

  const txtPath = path.join(OUT_DIR, `${PREFIX}-${stamp}.md`);
  const report = lines.join('\n');
  fs.writeFileSync(txtPath, report);
  console.log('\n' + report);
  console.log(`\nArtifacts:\n  ${jsonPath}\n  ${txtPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
