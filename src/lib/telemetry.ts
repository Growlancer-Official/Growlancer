type TelemetryPayload = Record<string, unknown>;

const isDev = import.meta.env.DEV;

function baseLog(level: 'info' | 'error', message: string, payload?: TelemetryPayload) {
  const logger = level === 'error' ? console.error : console.info;
  logger(`[telemetry:${level}] ${message}`, payload || {});
}

export function captureInfo(message: string, payload?: TelemetryPayload) {
  if (isDev) {
    baseLog('info', message, payload);
    return;
  }

  // Placeholder for future provider integration (Sentry/Datadog/etc).
  baseLog('info', message, payload);
}

export function captureError(message: string, payload?: TelemetryPayload) {
  baseLog('error', message, payload);
}
