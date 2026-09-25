import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Every migration must be LEXICALLY well-formed, because nothing else we run
 * can tell.
 *
 * Why this exists: `20270119000019_surface_audit_authorization_fixes.sql` was
 * committed with a single missing quote inside a `DO $patch_guards$ … $patch_guards$`
 * body that builds SQL out of string literals:
 *
 *     '      RETURN jsonb_build_object(''success'', false, ''error'', ''Unauthorized');'
 *                                                                           ^ missing '' closure
 *
 * The literal therefore ended one quote early, `' || chr(10) ||` started a new
 * one, and Postgres replied `syntax error at or near "' || chr(10) ||"`
 * (SQLSTATE 42601). It passed `npm run typecheck`, `npm test`, `npm run lint`,
 * `npm run build`, ten guard tests and nine negative controls — because all of
 * those read the migration as TEXT and pattern-match it. Only a real `db push`
 * parses it. That is the same blind spot as §18/§13.6: a check that inspects
 * text is not a check that the database will accept the text.
 *
 * So this walks the SQL the way a lexer does — single-quoted literals (with ''
 * escaping), double-quoted identifiers, `$tag$` dollar-quoted bodies, line
 * comments, and NESTED block comments — and fails on the states a lexer must
 * never be left in at end of file, plus the specific desync that broke the
 * deploy: a single-line-style literal that swallows a newline.
 *
 * It also fails if it scans a suspiciously small number of files, so a broken
 * glob cannot make this pass vacuously.
 */
const THIS_FILE = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(THIS_FILE), '../..');
const SQL_ROOT = path.join(ROOT, 'supabase');

type State = 'normal' | 'single' | 'double' | 'line-comment' | 'block-comment';

interface Problem {
  line: number;
  kind: string;
  detail: string;
  snippet: string;
}

/** All `.sql` files under supabase/, recursively. */
function sqlFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...sqlFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.sql')) found.push(full);
  }
  return found.sort();
}

/**
 * Lexes `sql` and returns everything that means "Postgres will reject or
 * misread this file". Deliberately a lexer, not a parser: the defect class that
 * escaped us is resolved entirely at the character level, and a lexer is small
 * enough to trust.
 *
 * `$tag$ … $tag$` bodies are recursed into rather than skipped. That is not a
 * nicety: the bug this file exists for lives INSIDE a `DO $patch_guards$` body,
 * and an earlier version of this lexer — which treated those bodies as opaque
 * text — certified the broken migration as clean. A lexer that skips the exact
 * place the defect is written proves nothing; the negative control below caught
 * this, which is precisely what the control is for.
 *
 * `lineOffset` lets a body report absolute file line numbers.
 */
function scanSql(sql: string): Problem[] {
  const problems: Problem[] = [];
  const lines = sql.split('\n');

  const snippet = (line: number) => (lines[line - 1] ?? '').trim().slice(0, 120);

  let state: State = 'normal';
  let openAt = 1;
  let openEscapes = false;
  let openIsJsonTemplate = false;
  const dollarTags: Array<{ tag: string; line: number }> = [];
  let commentDepth = 0;
  let line = 1;
  let i = 0;

  // `line` and `snippet` come from the SAME number, and the message is built
  // from it too: a finding that quotes one line while naming another is how a
  // report becomes untrustworthy exactly when someone needs it. There are no
  // offsets to drift here — the whole file is ONE pass, and `$tag$` bodies are
  // lexed in place (see the stack below) rather than recursed into with a
  // line-number correction. An earlier version recursed with an offset and
  // pointed one line off; removing the arithmetic removed the class of bug.
  const fail = (kind: string, line: number, detail: string) =>
    problems.push({ line, kind, detail, snippet: snippet(line) });

  /**
   * Inside a dollar-quoted body, the tag that closes it wins over any comment
   * state: a construct like `$g$… END IF; -- guard$g$),` is a string whose
   * content merely LOOKS like a comment, and the tag is its terminator. Returns
   * true when it consumed a closing tag.
   */
  const closeTagAt = (at: number): boolean => {
    const top = dollarTags[dollarTags.length - 1];
    if (!top || !sql.startsWith(top.tag, at)) return false;
    dollarTags.pop();
    commentDepth = 0;
    state = 'normal';
    i = at + top.tag.length;
    return true;
  };

  while (i < sql.length) {
    const c = sql[i];
    const next = sql[i + 1];

    if (c === '\n') {
      // A literal that reaches a newline is the desync signature. Every literal
      // in this repo — and in this style of migration generally — is written on
      // one line; a legitimately multi-line literal is legal SQL but would have
      // to be an explicit, reviewed exception rather than a silent desync.
      if ((state === 'single' && !openIsJsonTemplate) || state === 'double') {
        fail(
          'unterminated-literal',
          openAt,
          `${state === 'single' ? 'single-quoted literal' : 'double-quoted identifier'} on this line ` +
            `never closes — a quote is missing (this is exactly how 20270119000019 reached ` +
            `production, SQLSTATE 42601)`,
        );
        // Resynchronise: report one desync once, not every quote after it.
        state = 'normal';
      } else if (state === 'line-comment') {
        // A line comment ends here. Resetting it in THIS branch matters: this
        // branch runs first and `continue`s past the switch, so a reset written
        // only in the switch never ran — the lexer stayed "inside a comment"
        // for the rest of the file and reported every line after the first
        // comment as clean. A guard that silently stops guarding, reported as a
        // pass, is the exact defect class this file exists to catch.
        state = 'normal';
      }
      // A JSON template (`'{` … `}'::jsonb`) deliberately stays OPEN across the
      // newline. Resetting it here instead would terminate it silently and make
      // the closing quote look like a new opener — which is what an earlier
      // version of this branch did.
      line++;
      i++;
      continue;
    }

    switch (state) {
      case 'normal': {
        if (c === '-' && next === '-') {
          state = 'line-comment';
          openAt = line;
          i += 2;
          continue;
        }
        if (c === '/' && next === '*') {
          state = 'block-comment';
          openAt = line;
          commentDepth = 1;
          i += 2;
          continue;
        }
        if ((c === 'E' || c === 'e') && next === "'") {
          // Postgres escape string: backslash escapes are live inside it, so
          // `E'\n'` and `E'it\'s'` must not be lexed as if the backslash were
          // an ordinary character. This repo does write them.
          const before = i === 0 ? '' : sql[i - 1];
          if (!/[A-Za-z0-9_$"']/.test(before)) {
            state = 'single';
            openEscapes = true;
            openIsJsonTemplate = false;
            openAt = line;
            i += 2;
            continue;
          }
        }
        if (c === "'") {
          state = 'single';
          openEscapes = false;
          // A JSON template is the one literal this repo writes across lines
          // (`'{` … `}'::jsonb`). Anything else reaching a newline is a stray
          // quote, which is why this is a shape test and not a blanket
          // allowance for multi-line literals.
          openIsJsonTemplate = /[{[]\s*$/.test((lines[line - 1] ?? '').replace(/\r$/, ''));
          openAt = line;
          i++;
          continue;
        }
        if (c === '"') {
          state = 'double';
          openAt = line;
          i++;
          continue;
        }
        if (c === '$') {
          const tag = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(sql.slice(i))?.[0];
          if (tag) {
            // Bodies are lexed IN PLACE: after an opening tag the lexer carries
            // on in the same state machine, so a stray quote inside a body is
            // caught with its real file line. Matching tags are tracked on a
            // stack so `$controls$` containing `$fn$` nests correctly. (Skipping
            // bodies, or recursing with an offset, is how the original defect
            // got reported as clean.)
            const top = dollarTags[dollarTags.length - 1];
            if (top && top.tag === tag) dollarTags.pop();
            else dollarTags.push({ tag, line });
            i += tag.length;
            continue;
          }
        }
        break;
      }

      case 'single':
        if (openEscapes && c === '\\') {
          i += 2; // the next character is escaped, including a quote
          continue;
        }
        if (c === "'") {
          if (next === "'") {
            i += 2; // '' is an escaped quote, still inside the literal
            continue;
          }
          state = 'normal';
        }
        break;

      case 'double':
        if (c === '"') {
          if (next === '"') {
            i += 2;
            continue;
          }
          state = 'normal';
        }
        break;


      // A line comment ends at the newline, which the branch at the top of the
      // loop has already consumed — so there is nothing left to handle here.
      // A comment inside a dollar body ALSO ends at that body's closing tag,
      // because a tag that closes the body cannot be part of its content. Without
      // this, a `$g$ … -- note$g$` string (20270119000012 writes 21 of them) looks
      // like a comment that swallowed its own terminator, and every following line
      // is misread. Keep this branch and the one below in sync.
      case 'line-comment':
        if (closeTagAt(i)) continue;
        break;

      case 'block-comment':
        if (closeTagAt(i)) continue;
        if (c === '/' && next === '*') {
          commentDepth++; // Postgres block comments nest
          i += 2;
          continue;
        }
        if (c === '*' && next === '/') {
          commentDepth--;
          i += 2;
          if (commentDepth === 0) state = 'normal';
          continue;
        }
        break;
    }

    i++;
  }

  if (state === 'single' || state === 'double') {
    fail(
      'unterminated-literal-at-eof',
      openAt,
      `a literal opened on line ${openAt} is still open at end of file`,
    );
  }
  if (state === 'block-comment') {
    fail('unterminated-block-comment', openAt, `a block comment opened on line ${openAt} is never closed`);
  }
  for (const open of dollarTags) {
    fail(
      'unterminated-dollar-body',
      open.line,
      `dollar-quoted body ${open.tag} opened on line ${open.line} is never closed`,
    );
  }

  return problems;
}

describe('SQL migrations are lexically well-formed', () => {
  const files = sqlFiles(SQL_ROOT);

  it('scans the real migration set (a broken walk must not pass vacuously)', () => {
    expect(files.length, 'no .sql files found under supabase/ — this test would prove nothing').toBeGreaterThan(200);
    expect(files.some((f) => f.includes('20270119000019'))).toBe(true);
  });

  it('leaves no literal, dollar-quoted body or comment open', () => {
    const failures: string[] = [];
    for (const file of files) {
      for (const p of scanSql(fs.readFileSync(file, 'utf8'))) {
        failures.push(
          `${path.relative(ROOT, file).replace(/\\/g, '/')}:${p.line} [${p.kind}] ${p.detail}\n      ${p.snippet}`,
        );
      }
    }
    expect(
      failures,
      `\n\nA migration Postgres would refuse to parse is not deployable, and no text-matching test can see it:\n` +
        failures.join('\n') +
        '\n',
    ).toEqual([]);
  });

  it('still catches the exact desync that broke the 20270119000019 deploy', () => {
    // Negative control, inline: the buggy line as committed, inside a body that
    // is otherwise well-formed. The lexer must reject it.
    //
    // The comment lines are not decoration. An earlier version of this lexer
    // only reset its line-comment state inside the switch, which the newline
    // branch `continue`s past — so after the first `--` it treated the whole
    // rest of the file as a comment and reported the buggy line as clean. The
    // real migration has comments; a control without them would have kept
    // passing and kept hiding the bug.
    const buggy = [
      'DO $patch_guards$',
      'BEGIN',
      "  -- process_withdrawal_complete: owner or admin. Same treatment.",
      "      '      RETURN jsonb_build_object(''success'', false, ''error'', ''Unauthorized');' || chr(10) ||",
      "      '    END IF;');",
      'END',
      '$patch_guards$;',
    ].join('\n');

    const problems = scanSql(buggy);
    // The expected line is derived from the text, not hand-counted, so this
    // cannot drift when someone edits the fixture above.
    const buggyLine = buggy.split('\n').findIndex((l) => l.includes("''Unauthorized');")) + 1;
    expect(buggyLine).toBeGreaterThan(1);
    expect(problems, 'the lexer must reject the committed spelling').toHaveLength(1);
    expect(problems[0].kind).toBe('unterminated-literal');
    expect(problems[0].line).toBe(buggyLine);
    expect(problems[0].snippet).toContain("''Unauthorized');");
  });

  it('resumes normal lexing after every comment line', () => {
    // The lexer bug this pins: a comment line desynchronising the state machine
    // turned every following line into "already fine", which is a green result
    // produced by not looking. Comment styles here are the ones migrations use.
    const commentsThenSql = [
      '-- a header comment',
      "-- an apostrophe in prose: contract's lifetime value, don't",
      'CREATE TABLE t (a int);',
      'DO $patch_guards$',
      'BEGIN',
      "  -- contract's guard",
      "  v := 'x''y';",
      '  /* block',
      "     with an apostrophe too: contract's */",
      '  v := 1;',
      'END',
      '$patch_guards$;',
    ].join('\n');

    expect(scanSql(commentsThenSql)).toEqual([]);
  });

  it('accepts the fixed spelling and ordinary migration constructs', () => {
    const fixed = [
      'DO $patch_guards$',
      'DECLARE',
      '  v_sql text;',
      'BEGIN',
      "    v_sql := 'RETURN jsonb_build_object(''success'', false, ''error'', ''Unauthorized'');' || chr(10) ||",
      "            'END IF;';",
      '    EXECUTE v_sql;',
      "    -- an apostrophe in a comment doesn't open anything, e.g. contract's",
      '    /* nested /* block */ comment */',
      "    PERFORM 1 FROM t WHERE c = 'DALL-E' AND d = 'x''y';",
      'END',
      '$patch_guards$;',
    ].join('\n');

    expect(scanSql(fixed)).toEqual([]);
  });
});
