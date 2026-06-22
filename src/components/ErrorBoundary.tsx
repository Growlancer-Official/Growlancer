import React, { useState, useCallback } from 'react';
import { captureError } from '../lib/telemetry';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  componentStack: string | null;
  eventId: string | null;
}

const isDev = import.meta.env.DEV;

/**
 * Generates a short readable event ID for support reference.
 */
export function generateEventId(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `ERR-${ts}-${rand}`;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    componentStack: null,
    eventId: null,
  };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error, componentStack: null, eventId: generateEventId() };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    const eventId = this.state.eventId || generateEventId();
    captureError('Unhandled UI error boundary event', {
      source: 'ui',
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
      eventId,
    });
    this.setState({ componentStack: info.componentStack, eventId });
  }

  /** Attempt to recover by re-rendering children */
  handleRetry = () => {
    this.setState({ hasError: false, error: null, componentStack: null, eventId: null });
  };

  render() {
    if (this.state.hasError) {
      const { error, componentStack, eventId } = this.state;
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] p-4 sm:p-6">
          <div className="w-full max-w-lg text-center bg-white rounded-2xl shadow-lg p-8 sm:p-10 border border-slate-200">
            {/* Error icon */}
            <div className="mx-auto mb-5 w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center">
              <svg className="w-7 h-7 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>

            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mb-2">Something went wrong</h1>
            <p className="text-sm sm:text-base text-slate-500 mb-2">
              We encountered an unexpected error. Our team has been notified.
            </p>

            {eventId && (
              <p className="text-xs text-slate-400 mb-6 font-mono">
                Reference: <span className="text-slate-500">{eventId}</span>
              </p>
            )}

            {/* Collapsible technical details (dev only) */}
            {isDev && error && (
              <details className="mb-6 text-left">
                <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600 select-none font-medium">
                  Technical details
                </summary>
                <div className="mt-2 p-3 bg-slate-50 rounded-xl text-xs text-slate-600 font-mono whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed">
                  <strong className="text-slate-700">Error:</strong> {error.message}
                  {error.stack && (
                    <>
                      <br /><br />
                      <strong className="text-slate-700">Stack:</strong><br />
                      {error.stack}
                    </>
                  )}
                  {componentStack && (
                    <>
                      <br /><br />
                      <strong className="text-slate-700">Component Stack:</strong><br />
                      {componentStack}
                    </>
                  )}
                </div>
              </details>
            )}

            {/* Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                type="button"
                onClick={this.handleRetry}
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 active:bg-emerald-800 transition-colors shadow-sm"
              >
                Try Again
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="w-full sm:w-auto px-6 py-3 rounded-xl border border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50 active:bg-slate-100 transition-colors"
              >
                Reload Page
              </button>
            </div>

            {isDev && (
              <p className="mt-6 text-xs text-slate-400">
                These details are visible in development mode only.
              </p>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
