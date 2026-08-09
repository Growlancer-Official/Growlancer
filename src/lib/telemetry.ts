import { supabase } from './supabase';

type TelemetryPayload = Record<string, unknown>;

const isDev = import.meta.env.DEV;

function baseLog(level: 'info' | 'error', message: string, payload?: TelemetryPayload) {
  const logger = level === 'error' ? console.error : console.info;
  logger(`[telemetry:${level}] ${message}`, payload || {});
}

/**
 * Persist a client-side error to the `client_errors` table so every
 * ERR-<ts>-<rand> reference shown by the ErrorBoundary is traceable in
 * real time (admin/monitor can look up the exact stack + page + user).
 *
 * Fire-and-forget: never throws, never blocks the UI, never recurses.
 */
function persistError(payload: TelemetryPayload) {
  try {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const session = supabase.auth.getSession();

    void session
      .then(({ data }) => {
        const userId = data?.session?.user?.id ?? null;
        return supabase
          .from('client_errors' as any)
          .insert({
            event_id: payload.eventId || null,
            user_id: userId,
            message: payload.message || '',
            stack: payload.stack || null,
            component_stack: payload.componentStack || null,
            url,
            user_agent: userAgent,
            role: payload.role || null,
          } as any);
      })
      .catch(() => undefined);
  } catch {
    // Telemetry must never break the app
  }
}

export function captureInfo(message: string, payload?: TelemetryPayload) {
  if (isDev) {
    baseLog('info', message, payload);
    return;
  }

  baseLog('info', message, payload);
}

export function captureError(message: string, payload?: TelemetryPayload) {
  baseLog('error', message, payload);
  // Persist to Supabase so ERR- references are traceable in production.
  // Skipped in dev to avoid polluting the production client_errors table
  // with local-development noise.
  if (!isDev) {
    persistError(payload || {});
  }
}
