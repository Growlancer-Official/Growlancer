import { useEffect, useMemo, useRef, useState } from 'react';

export type TerminalSegment = { text: string; className?: string };
export type TerminalLine = TerminalSegment[];

interface LiveCodeTerminalProps {
  /** Each line is an array of syntax-colored segments. */
  lines: TerminalLine[];
  /** Milliseconds per typed character. */
  charMs?: number;
  /** Pause after a full line is typed. */
  linePauseMs?: number;
  /** Pause when the whole script is complete before restarting. */
  endPauseMs?: number;
  /** Extra classes for the container (e.g. spacing). */
  className?: string;
}

/** Flatten all lines into a single array of { char, className } so we can type continuously. */
function flattenLines(lines: TerminalLine[]): TerminalSegment[] {
  const flat: TerminalSegment[] = [];
  for (const line of lines) {
    for (const seg of line) {
      for (const ch of seg.text) {
        flat.push({ text: ch, className: seg.className });
      }
    }
  }
  return flat;
}

export function LiveCodeTerminal({
  lines,
  charMs = 28,
  linePauseMs = 450,
  endPauseMs = 3200,
  className = '',
}: LiveCodeTerminalProps) {
  const flat = useMemo(() => flattenLines(lines), [lines]);

  // Line boundary indices (index in `flat` where each line starts).
  const lineStarts = useMemo(() => {
    const starts: number[] = [0];
    let acc = 0;
    for (const line of lines) {
      acc += line.reduce((sum, seg) => sum + seg.text.length, 0);
      starts.push(acc);
    }
    return starts;
  }, [lines]);

  const [typed, setTyped] = useState(0);
  const [reduced, setReduced] = useState(false);
  const firstRun = useRef(true);

  // Respect prefers-reduced-motion — render the full script statically.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Typing loop: schedule the next char in the effect body (NOT inside the state
  // updater, which would be cleared by this effect's own cleanup on every tick).
  useEffect(() => {
    if (reduced) {
      setTyped(flat.length);
      return;
    }
    if (flat.length === 0) return;

    if (typed >= flat.length) {
      // Finished — wait, then restart the loop.
      const t = window.setTimeout(() => setTyped(0), endPauseMs);
      return () => window.clearTimeout(t);
    }

    // Just completed a full line → hold briefly before starting the next.
    const justCompletedLine = typed > 0 && lineStarts.slice(1, -1).includes(typed);
    // Small initial delay on first mount only.
    const delay = typed === 0 && firstRun.current ? 600 : justCompletedLine ? linePauseMs : charMs;
    firstRun.current = false;
    const t = window.setTimeout(() => setTyped((v) => v + 1), delay);
    return () => window.clearTimeout(t);
  }, [typed, flat.length, lineStarts, charMs, linePauseMs, endPauseMs, reduced]);

  // Determine which line the cursor sits on.
  let cursorLine = 0;
  let consumed = 0;
  for (let li = 0; li < lines.length; li++) {
    const len = lines[li].reduce((sum, seg) => sum + seg.text.length, 0);
    if (Math.min(typed, flat.length) > consumed) {
      cursorLine = li;
    }
    consumed += len;
  }

  return (
    <div className={`font-mono text-xs leading-relaxed ${className}`} aria-hidden="true">
      {lines.map((line, li) => {
        const lineLen = line.reduce((sum, seg) => sum + seg.text.length, 0);
        const lineStart = lineStarts[li];
        const visibleCount = Math.max(0, Math.min(typed, flat.length) - lineStart);
        const count = Math.min(visibleCount, lineLen);

        let remaining = count;
        const segments: TerminalSegment[] = [];
        for (const seg of line) {
          if (remaining <= 0) break;
          const take = Math.min(remaining, seg.text.length);
          segments.push({ text: seg.text.slice(0, take), className: seg.className });
          remaining -= take;
        }

        const showCursor = !reduced && li === cursorLine;

        return (
          <p key={li} className="whitespace-pre-wrap break-words">
            {segments.map((seg, si) => (
              <span key={si} className={seg.className ?? ''}>
                {seg.text}
              </span>
            ))}
            {showCursor && <span className="terminal-cursor" />}
          </p>
        );
      })}
    </div>
  );
}
