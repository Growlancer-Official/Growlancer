// ═══════════════════════════════════════════════════════════════════════
// Shared client error sanitizer for Growlancer edge functions.
//
// MR-17 (original findings SEC-010 / ERR-04 / AI-001(leak) / API-007(leak)).
// Raw `error.message` values were being returned verbatim in HTTP response
// bodies. Those strings leak internal detail — Postgres/PostgREST error text,
// constraint and column names, table/relation names, stack context and
// upstream API error bodies (including the AI provider's echoed response) —
// which helps an attacker map the backend and craft further attacks.
//
// `clientError()` logs the FULL detail server-side (console.error, so it still
// reaches logs/telemetry for debugging) and returns a GENERIC, safe message for
// the client. It NEVER returns the raw error text, and never logs secrets.
//
// Usage:
//   catch (err) {
//     return new Response(JSON.stringify({ error: clientError(err) }), { status: 500, ... });
//   }
//   // or with a domain-specific fallback:
//   { error: clientError(err, 'Failed to submit application.') }
// ═══════════════════════════════════════════════════════════════════════

/**
 * Log the full error server-side and return a generic message safe to send to
 * the client. Use for any catch-all / unexpected failure.
 */
export function clientError(err: unknown, fallback = 'Internal server error'): string {
    logServerError(err);
    return fallback;
}

/**
 * Log the full error server-side without returning anything. Use when a caller
 * needs to choose its own generic client-facing message.
 */
export function logServerError(err: unknown, context?: string): void {
    const prefix = context ? `[error] ${context}:` : '[error]';
    if (err instanceof Error) {
        console.error(prefix, err.name, '-', err.message, '\n', err.stack ?? '');
    } else {
        console.error(prefix, typeof err === 'string' ? err : safeStringify(err));
    }
}

function safeStringify(value: unknown): string {
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}
