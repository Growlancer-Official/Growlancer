// ═══════════════════════════════════════════════════════════════════════
// Shared outbound-URL guard (SSRF defense) for Growlancer edge functions.
//
// MR-16 (original findings SEC-013 / STORAGE-003 / API-007).
// Several edge functions fetch URLs that are ultimately influenced by user
// input — email attachments (_shared/brevo.ts), internship resume/portfolio
// document links (internship-applications), and avatar images (avatarPack).
// Without validation an attacker can point those URLs at the loopback
// interface, private RFC1918 ranges, link-local space, or the cloud metadata
// service (169.254.169.254) and coerce the SERVER into issuing requests on
// their behalf (SSRF) — reading internal services or cloud credentials.
//
// This helper FAILS CLOSED: any URL that is not a plain https URL whose host
// is provably not an internal/reserved address is REJECTED. Callers that know
// exactly which host they expect (e.g. our own Supabase storage) should also
// pass `allowedHosts`, so DNS tricks cannot redirect the request elsewhere.
//
// SECURITY: this module never logs the raw URL (signed-URL tokens / PII);
// callers log a redacted reason instead.
// ═══════════════════════════════════════════════════════════════════════

export class UnsafeUrlError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'UnsafeUrlError';
    }
}

export interface UrlGuardOptions {
    /** Exact host hostnames allowed. When set, any other host is rejected. */
    allowedHosts?: string[];
    /** Permit plain http:// (default false — https is required). */
    allowHttp?: boolean;
}

const BLOCKED_HOST_SUFFIXES = [
    'localhost',
    '.localhost',
    '.local',
    '.internal',
    '.lan',
    '.home.arpa',
    '.in-addr.arpa',
    '.ip6.arpa',
];

/** Parse a dotted-quad IPv4 literal into its 4 octets, or null if not a literal. */
function parseIPv4(host: string): number[] | null {
    const parts = host.split('.');
    if (parts.length !== 4) return null;
    const octets: number[] = [];
    for (const part of parts) {
        if (!/^\d{1,3}$/.test(part)) return null;
        const n = Number(part);
        if (n < 0 || n > 255) return null;
        octets.push(n);
    }
    return octets;
}

/** True for loopback / private / link-local / CGNAT / reserved / metadata IPv4. */
function isPrivateIPv4(octets: number[]): boolean {
    const [a, b, c] = octets;
    if (a === 0) return true;                       // 0.0.0.0/8 (this network)
    if (a === 10) return true;                      // 10.0.0.0/8
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    if (a === 127) return true;                     // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true;        // 169.254.0.0/16 link-local + metadata
    if (a === 172 && b >= 16 && b <= 31) return true;  // 172.16.0.0/12
    if (a === 192 && b === 0 && c === 0) return true;  // 192.0.0.0/24
    if (a === 192 && b === 0 && c === 2) return true;  // 192.0.2.0/24 TEST-NET-1
    if (a === 192 && b === 88 && c === 99) return true; // 192.88.99.0/24
    if (a === 192 && b === 168) return true;        // 192.168.0.0/16
    if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15
    if (a === 198 && b === 51 && c === 100) return true;  // 198.51.100.0/24 TEST-NET-2
    if (a === 203 && b === 0 && c === 113) return true;   // 203.0.113.0/24 TEST-NET-3
    if (a >= 224) return true;                      // multicast / reserved / broadcast
    return false;
}

/** True for loopback / ULA / link-local / multicast / IPv4-mapped IPv6 literals. */
function isPrivateIPv6(rawHost: string): boolean {
    const host = rawHost.replace(/^\[|\]$/g, '').toLowerCase();
    if (host === '::' || host === '::1') return true;

    // IPv4-mapped/compatible forms: ::ffff:127.0.0.1 or ::127.0.0.1
    const embedded = host.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (embedded) {
        const octets = parseIPv4(embedded[1]);
        if (octets && isPrivateIPv4(octets)) return true;
    }

    if (host.startsWith('fe8') || host.startsWith('fe9') ||
        host.startsWith('fea') || host.startsWith('feb')) return true; // fe80::/10
    if (host.startsWith('fc') || host.startsWith('fd')) return true;   // fc00::/7 ULA
    if (host.startsWith('ff')) return true;                            // ff00::/8 multicast
    return false;
}

/** True when the host is a literal private/reserved address or a risky name. */
export function isPrivateOrReservedHost(hostname: string): boolean {
    const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (!host) return true;

    const v4 = parseIPv4(host);
    if (v4) return isPrivateIPv4(v4);

    if (host.includes(':')) return isPrivateIPv6(host);

    if (BLOCKED_HOST_SUFFIXES.some((s) => host === s.replace(/^\./, '') || host.endsWith(s))) {
        return true;
    }

    // A bare single-label hostname (no dot) is not a valid public DNS name and
    // can resolve to an internal service — reject it.
    if (!host.includes('.')) return true;

    return false;
}

function hostMatchesAllowlist(hostname: string, allowedHosts: string[]): boolean {
    const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
    return allowedHosts.some((allowed) => {
        const a = allowed.toLowerCase().replace(/^\[|\]$/g, '');
        return host === a || host.endsWith(`.${a}`);
    });
}

/**
 * Validate an outbound URL. Throws UnsafeUrlError when the URL is not a
 * plain https URL pointing at a public host. Fails closed.
 */
export function assertSafeOutboundUrl(url: string, opts: UrlGuardOptions = {}): URL {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        throw new UnsafeUrlError('Outbound URL is not a valid absolute URL');
    }

    if (opts.allowHttp) {
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
            throw new UnsafeUrlError('Outbound URL must use http(s)');
        }
    } else if (parsed.protocol !== 'https:') {
        throw new UnsafeUrlError('Outbound URL must use https');
    }

    if (!parsed.hostname) {
        throw new UnsafeUrlError('Outbound URL has no host');
    }

    if (opts.allowedHosts && opts.allowedHosts.length > 0) {
        if (!hostMatchesAllowlist(parsed.hostname, opts.allowedHosts)) {
            throw new UnsafeUrlError('Outbound URL host is not in the allowlist');
        }
    } else if (isPrivateOrReservedHost(parsed.hostname)) {
        throw new UnsafeUrlError('Outbound URL host is private/reserved');
    }

    return parsed;
}

/** Non-throwing variant of assertSafeOutboundUrl. */
export function isSafeOutboundUrl(url: string, opts: UrlGuardOptions = {}): boolean {
    try {
        assertSafeOutboundUrl(url, opts);
        return true;
    } catch {
        return false;
    }
}

/**
 * Defense-in-depth variant that additionally resolves the hostname and
 * rejects it when it points at a private/reserved address (guards against a
 * public name resolving inward / simple DNS rebinding). Uses Deno's native
 * `Deno.resolveDns` when available; if the resolver is unavailable we fall
 * back to the deterministic literal checks in assertSafeOutboundUrl.
 */
export async function assertSafeOutboundUrlResolved(
    url: string,
    opts: UrlGuardOptions = {},
): Promise<URL> {
    const parsed = assertSafeOutboundUrl(url, opts);

    const resolveDns = (globalThis as { Deno?: { resolveDns?: unknown } }).Deno?.resolveDns as
        | ((name: string, type: 'A' | 'AAAA') => Promise<string[]>)
        | undefined;

    if (typeof resolveDns === 'function') {
        for (const record of ['A', 'AAAA'] as const) {
            try {
                const ips = await resolveDns(parsed.hostname, record);
                for (const ip of ips ?? []) {
                    if (isPrivateOrReservedHost(ip)) {
                        throw new UnsafeUrlError('Outbound URL resolves to a private/reserved address');
                    }
                }
            } catch (err) {
                if (err instanceof UnsafeUrlError) throw err;
                // Resolver unavailable / name not resolvable — the literal checks in
                // assertSafeOutboundUrl already ran, so fall through (non-fatal).
            }
        }
    }

    return parsed;
}
