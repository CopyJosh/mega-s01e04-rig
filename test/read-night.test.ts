import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read-night.js';

const night = '2026-10-28';
const entry = { at: '2026-10-28T23:00:02+01:00', job: 'job', status: 'ok', owner: 'rook' };
const directories: string[] = [];
function fixture(contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-reader-'));
  directories.push(dir);
  writeFileSync(join(dir, `${night}.jsonl`), contents);
  return dir;
}
afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('readNight', () => {
  it('reads the real night into five complete rows and counts its bad line', () => {
    const runsDir = fileURLToPath(new URL('../runs/', import.meta.url));
    expect(readNight(runsDir, night)).toEqual({
      found: true, badLines: 1, counts: { ok: 10, retry: 4, fail: 1 },
      rows: [
        { job: 'digest/render', owner: null, runs: 1, retries: 0, lastStatus: 'ok', lastError: null,
          firstAt: '2026-10-29T05:41:09+01:00', lastAt: '2026-10-29T05:41:09+01:00', hasFailure: false },
        { job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3, lastStatus: 'ok', lastError: null,
          firstAt: '2026-10-29T01:30:00+01:00', lastAt: '2026-10-29T01:37:00+01:00', hasFailure: false },
        { job: 'lane/sync', owner: 'rook', runs: 8, retries: 1, lastStatus: 'ok', lastError: null,
          firstAt: '2026-10-28T23:00:06+01:00', lastAt: '2026-10-29T05:00:04+01:00', hasFailure: false },
        { job: 'notes/backup', owner: 'lane-07', runs: 1, retries: 0, lastStatus: 'fail', lastError: 'quota exceeded',
          firstAt: '2026-10-29T04:00:01+01:00', lastAt: '2026-10-29T04:00:01+01:00', hasFailure: true },
        { job: 'rig/rotate-logs', owner: 'lane-07', runs: 1, retries: 0, lastStatus: 'ok', lastError: null,
          firstAt: '2026-10-28T23:00:02+01:00', lastAt: '2026-10-28T23:00:02+01:00', hasFailure: false },
      ],
    });
  });

  it('distinguishes missing, empty, and blank nights', () => {
    const dir = fixture('');
    const empty = { found: true, rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } };
    expect(readNight(dir, '2026-10-27')).toEqual({ found: false });
    expect(readNight(dir, night)).toEqual(empty);
    writeFileSync(join(dir, `${night}.jsonl`), '\n \t\r\n');
    expect(readNight(dir, night)).toEqual(empty);
  });

  it('uses log order, preserves offsets, updates nullable owners, and remembers a recovered failure', () => {
    const firstAt = '2026-10-29T05:00:00.123+05:30';
    const lastAt = '2026-10-28T00:00:00-04:00';
    const dir = fixture([
      { ...entry, at: firstAt, status: 'fail', error: 'failed' },
      { ...entry, status: 'retry', error: 'retrying' },
      { ...entry, at: lastAt, owner: null },
      { ...entry, job: '__proto__', error: '' },
      { ...entry, job: 'Z' },
      { ...entry, job: 'a' },
    ].map((value) => JSON.stringify(value)).join('\r\n'));
    const result = readNight(dir, night);
    expect(result.found).toBe(true);
    if (!result.found) throw new Error('Expected a present night');
    expect(result.counts).toEqual({ ok: 4, retry: 1, fail: 1 });
    expect(result.rows.map((row) => row.job)).toEqual(['Z', '__proto__', 'a', 'job']);
    expect(result.rows[1].lastError).toBe('');
    expect(result.rows[3]).toEqual({ job: 'job', owner: null, runs: 3, retries: 1,
      lastStatus: 'ok', lastError: null, firstAt, lastAt, hasFailure: true });
  });

  it.each([
    '{', 'null', '[]', '42', '"text"', '{}',
    JSON.stringify({ ...entry, job: '' }),
    JSON.stringify({ ...entry, job: '   ' }),
    JSON.stringify({ ...entry, job: 42 }),
    JSON.stringify({ ...entry, status: 'unknown' }),
    JSON.stringify({ ...entry, owner: undefined }),
    JSON.stringify({ ...entry, owner: 42 }),
    JSON.stringify({ ...entry, error: null }),
    JSON.stringify({ ...entry, error: {} }),
    ...[null, 42, '', 'yesterday', '2026-10-28', '2026-10-28T12:00:00',
      '2026-02-30T00:00:00Z', '2026-13-01T00:00:00Z', '2026-10-28T24:00:00Z',
      '2026-10-28T12:00:00+25:00'].map((at) => JSON.stringify({ ...entry, at })),
  ])('counts malformed input without losing valid surrounding entries: %s', (badLine) => {
    const dir = fixture(`${JSON.stringify(entry)}\n${badLine}\n${JSON.stringify(entry)}\n`);
    const result = readNight(dir, night);
    expect(result).toMatchObject({ found: true, badLines: 1, counts: { ok: 2, retry: 0, fail: 0 },
      rows: [{ job: 'job', runs: 2 }] });
  });

  it('keeps an all-malformed night present', () => {
    expect(readNight(fixture('null\n{\n'), night)).toEqual({
      found: true, rows: [], badLines: 2, counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('accepts UTC, leap days, and extra fields without changing timestamp text', () => {
    const at = '2024-02-29T12:30:00Z';
    const result = readNight(fixture(JSON.stringify({ ...entry, at, extra: true })), night);
    expect(result).toMatchObject({ found: true, badLines: 0, rows: [{ firstAt: at, lastAt: at }] });
  });

  it('rejects paths instead of reading a file outside the runs directory', () => {
    const dir = fixture(JSON.stringify(entry));
    mkdirSync(join(dir, 'nested'));
    expect(readNight(join(dir, 'nested'), `../${night}`)).toEqual({ found: false });
    expect(readNight(dir, join(dir, night))).toEqual({ found: false });
  });

  it('does not conceal filesystem failures as missing nights', () => {
    const dir = fixture('');
    rmSync(join(dir, `${night}.jsonl`));
    mkdirSync(join(dir, `${night}.jsonl`));
    expect(() => readNight(dir, night)).toThrow();
  });
});
