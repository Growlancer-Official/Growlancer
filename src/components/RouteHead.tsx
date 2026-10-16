import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * RouteHead — per-route document head metadata (MR-43 / SEO-002).
 *
 * The app uses a single Vike catch-all (`pages/@path/+route.ts` → `/*`) that
 * delegates all routing to react-router-dom inside `src/app/App.tsx`. That
 * means there is only one SSR `+Head.tsx` and no per-page Vike heads. This
 * component restores per-route metadata (title, description, canonical,
 * Open Graph/Twitter tags and robots indexing directives) on the client.
 *
 * The global `pages/+Head.tsx` / `index.html` fallback remains the SSR
 * baseline; this only refines it after navigation.
 */

const SITE_URL = 'https://growlancer.com';
const SITE_NAME = 'Growlancer';
const DEFAULT_TITLE = 'Growlancer — AI-Powered Freelancing Marketplace';
const DEFAULT_DESCRIPTION =
    'Growlancer is an AI-powered freelancing marketplace connecting talented freelancers with innovative clients. Find work, hire talent, and collaborate seamlessly.';

interface RouteMeta {
    title: string;
    description: string;
    /** Private/authenticated route → keep out of search indexes. */
    noindex?: boolean;
}

interface RouteRule {
    test: (pathname: string) => boolean;
    meta: RouteMeta;
}

function isPath(prefix: string): (p: string) => boolean {
    return (p) => p === prefix || p.startsWith(prefix + '/');
}

function exact(path: string): (p: string) => boolean {
    return (p) => p === path;
}

function dynamic(prefix: string): (p: string) => boolean {
    const re = new RegExp(`^${prefix}/[^/]+$`);
    return (p) => re.test(p);
}

/**
 * Ordered rules — FIRST match wins. Private/dynamic rules are evaluated before
 * static public ones so that e.g. `/dashboard/*` never falls through to a
 * public default.
 */
const ROUTE_RULES: RouteRule[] = [
    // ── Private / authenticated surfaces (noindex) ─────────────────────
    {
        test: isPath('/admin'),
        meta: { title: `Admin · ${SITE_NAME}`, description: 'Growlancer administration console.', noindex: true },
    },
    {
        test: isPath('/dashboard'),
        meta: { title: `Dashboard · ${SITE_NAME}`, description: 'Your Growlancer workspace.', noindex: true },
    },
    {
        test: isPath('/client'),
        meta: { title: `Client Dashboard · ${SITE_NAME}`, description: 'Manage your projects on Growlancer.', noindex: true },
    },
    {
        test: isPath('/onboarding'),
        meta: { title: `Get Started · ${SITE_NAME}`, description: 'Set up your Growlancer account.', noindex: true },
    },
    {
        test: isPath('/settings'),
        meta: { title: `Settings · ${SITE_NAME}`, description: 'Manage your Growlancer settings.', noindex: true },
    },
    {
        test: isPath('/messages'),
        meta: { title: `Messages · ${SITE_NAME}`, description: 'Your Growlancer messages.', noindex: true },
    },
    {
        test: isPath('/wallet'),
        meta: { title: `Wallet · ${SITE_NAME}`, description: 'Your Growlancer wallet.', noindex: true },
    },
    {
        test: isPath('/notifications'),
        meta: { title: `Notifications · ${SITE_NAME}`, description: 'Your Growlancer notifications.', noindex: true },
    },
    {
        test: isPath('/checkout'),
        meta: { title: `Checkout · ${SITE_NAME}`, description: 'Complete your Growlancer checkout.', noindex: true },
    },
    {
        test: isPath('/payment'),
        meta: { title: `Payment · ${SITE_NAME}`, description: 'Payment status.', noindex: true },
    },
    {
        test: isPath('/report'),
        meta: { title: `Report · ${SITE_NAME}`, description: 'Report an issue to Growlancer.', noindex: true },
    },

    // ── Auth action routes (noindex) ───────────────────────────────────
    {
        test: isPath('/auth/forgot-password'),
        meta: { title: `Reset Your Password · ${SITE_NAME}`, description: 'Reset your Growlancer password.', noindex: true },
    },
    {
        test: isPath('/auth/reset-password'),
        meta: { title: `Set a New Password · ${SITE_NAME}`, description: 'Choose a new Growlancer password.', noindex: true },
    },
    {
        test: isPath('/auth/magic-link'),
        meta: { title: `Sign In · ${SITE_NAME}`, description: 'Sign in to Growlancer.', noindex: true },
    },
    {
        test: isPath('/auth/otp'),
        meta: { title: `Verify Your Email · ${SITE_NAME}`, description: 'Verify your email with a one-time code.', noindex: true },
    },
    {
        test: isPath('/auth/email-confirm') || isPath('/auth/verify-email'),
        meta: { title: `Confirm Your Email · ${SITE_NAME}`, description: 'Confirm your Growlancer email address.', noindex: true },
    },
    {
        test: isPath('/auth/callback'),
        meta: { title: `Signing You In · ${SITE_NAME}`, description: 'Completing sign-in.', noindex: true },
    },
    {
        test: isPath('/auth'),
        meta: { title: `Sign In · ${SITE_NAME}`, description: 'Sign in to Growlancer.', noindex: true },
    },

    // ── Dynamic public routes ──────────────────────────────────────────
    {
        test: dynamic('/projects'),
        meta: { title: `Project Details · ${SITE_NAME}`, description: 'View project details on Growlancer.' },
    },
    {
        test: dynamic('/freelancer'),
        meta: { title: `Freelancer Profile · ${SITE_NAME}`, description: 'View a freelancer profile on Growlancer.' },
    },
    {
        test: dynamic('/services'),
        meta: { title: `Service Details · ${SITE_NAME}`, description: 'View a service on Growlancer.' },
    },
    {
        test: dynamic('/contests'),
        meta: { title: `Contest Details · ${SITE_NAME}`, description: 'View a design contest on Growlancer.' },
    },
    {
        test: dynamic('/certificate') || dynamic('/verify-certificate'),
        meta: { title: `Certificate Verification · ${SITE_NAME}`, description: 'Verify a Growlancer certificate.' },
    },

    // ── Static public routes ───────────────────────────────────────────
    {
        test: exact('/'),
        meta: {
            title: DEFAULT_TITLE,
            description: DEFAULT_DESCRIPTION,
        },
    },
    {
        test: exact('/how-it-works'),
        meta: { title: `How It Works · ${SITE_NAME}`, description: 'Learn how Growlancer connects freelancers and clients.' },
    },
    {
        test: exact('/features'),
        meta: { title: `Features · ${SITE_NAME}`, description: 'Explore Growlancer features for freelancers and clients.' },
    },
    {
        test: exact('/categories'),
        meta: { title: `Categories · ${SITE_NAME}`, description: 'Browse freelancing categories on Growlancer.' },
    },
    {
        test: exact('/pricing'),
        meta: { title: `Pricing · ${SITE_NAME}`, description: 'Growlancer pricing and plans.' },
    },
    {
        test: exact('/about'),
        meta: { title: `About · ${SITE_NAME}`, description: 'About Growlancer and our mission.' },
    },
    {
        test: exact('/philosophy'),
        meta: { title: `Our Philosophy · ${SITE_NAME}`, description: 'The philosophy behind Growlancer.' },
    },
    {
        test: exact('/internships') || exact('/careers'),
        meta: { title: `Internships & Careers · ${SITE_NAME}`, description: 'Internship and career opportunities at Growlancer.' },
    },
    {
        test: exact('/contact'),
        meta: { title: `Contact · ${SITE_NAME}`, description: 'Get in touch with the Growlancer team.' },
    },
    {
        test: exact('/help-center'),
        meta: { title: `Help Center · ${SITE_NAME}`, description: 'Help and support for Growlancer users.' },
    },
    {
        test: exact('/safety'),
        meta: { title: `Safety · ${SITE_NAME}`, description: 'Trust and safety on Growlancer.' },
    },
    {
        test: exact('/guidelines'),
        meta: { title: `Community Guidelines · ${SITE_NAME}`, description: 'Growlancer community guidelines.' },
    },
    {
        test: exact('/status'),
        meta: { title: `System Status · ${SITE_NAME}`, description: 'Growlancer platform status and uptime.' },
    },
    {
        test: exact('/terms'),
        meta: { title: `Terms of Service · ${SITE_NAME}`, description: 'Growlancer terms of service.' },
    },
    {
        test: exact('/privacy'),
        meta: { title: `Privacy Policy · ${SITE_NAME}`, description: 'Growlancer privacy policy.' },
    },
    {
        test: exact('/escrow-policy'),
        meta: { title: `Escrow Policy · ${SITE_NAME}`, description: 'How Growlancer escrow works.' },
    },
    {
        test: exact('/refund-policy'),
        meta: { title: `Refund Policy · ${SITE_NAME}`, description: 'Growlancer refund policy.' },
    },
    {
        test: exact('/cookies'),
        meta: { title: `Cookie Policy · ${SITE_NAME}`, description: 'Growlancer cookie policy.' },
    },
    {
        test: exact('/freelancers'),
        meta: { title: `Find Freelancers · ${SITE_NAME}`, description: 'Search and hire talented freelancers on Growlancer.' },
    },
    {
        test: exact('/services'),
        meta: { title: `Browse Services · ${SITE_NAME}`, description: 'Browse professional services on Growlancer.' },
    },
    {
        test: exact('/contests'),
        meta: { title: `Design Contests · ${SITE_NAME}`, description: 'Run or join design contests on Growlancer.' },
    },
    {
        test: exact('/waitlist'),
        meta: { title: `Join the Waitlist · ${SITE_NAME}`, description: 'Join the Growlancer waitlist.' },
    },
];

const NOT_FOUND_META: RouteMeta = {
    title: `Page Not Found · ${SITE_NAME}`,
    description: 'The page you are looking for could not be found.',
    noindex: true,
};

function resolveMeta(pathname: string): RouteMeta {
    const p = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
    for (const rule of ROUTE_RULES) {
        if (rule.test(p)) return rule.meta;
    }
    return NOT_FOUND_META;
}

function upsertMetaByName(name: string, content: string): void {
    let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
    if (!el) {
        el = document.createElement('meta');
        el.setAttribute('name', name);
        document.head.appendChild(el);
    }
    el.setAttribute('content', content);
}

function upsertMetaByProperty(property: string, content: string): void {
    let el = document.head.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
    if (!el) {
        el = document.createElement('meta');
        el.setAttribute('property', property);
        document.head.appendChild(el);
    }
    el.setAttribute('content', content);
}

function upsertCanonical(href: string): void {
    let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!el) {
        el = document.createElement('link');
        el.setAttribute('rel', 'canonical');
        document.head.appendChild(el);
    }
    el.setAttribute('href', href);
}

export function RouteHead() {
    const { pathname } = useLocation();

    useEffect(() => {
        if (typeof document === 'undefined') return;

        const meta = resolveMeta(pathname);
        const canonicalUrl = `${SITE_URL}${pathname === '/' ? '/' : pathname.replace(/\/+$/, '')}`;

        document.title = meta.title;

        upsertMetaByName('description', meta.description);
        upsertMetaByName('robots', meta.noindex ? 'noindex, nofollow' : 'index, follow');

        // Open Graph
        upsertMetaByProperty('og:title', meta.title);
        upsertMetaByProperty('og:description', meta.description);
        upsertMetaByProperty('og:url', canonicalUrl);
        upsertMetaByProperty('og:site_name', SITE_NAME);

        // Twitter
        upsertMetaByName('twitter:title', meta.title);
        upsertMetaByName('twitter:description', meta.description);
        upsertMetaByName('twitter:url', canonicalUrl);

        upsertCanonical(canonicalUrl);
    }, [pathname]);

    return null;
}

export default RouteHead;
