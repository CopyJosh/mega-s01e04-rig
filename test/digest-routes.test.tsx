import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const tempDirs: string[] = [];

function makeRunsDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  tempDirs.push(dir);
  return dir;
}

function writeNight(runsDir: string, night: string, contents: string): void {
  mkdirSync(runsDir, { recursive: true });
  writeFileSync(join(runsDir, `${night}.jsonl`), contents);
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('digest routes', () => {
  it('renders matching sorted rows in HTML and JSON, preserving missing owners and timestamp offsets', async () => {
    const runsDir = makeRunsDir();
    writeNight(
      runsDir,
      '2026-10-28',
      [
        JSON.stringify({ at: '2026-10-28T07:10:00-04:00', job: 'zeta', status: 'retry', owner: null }),
        JSON.stringify({ at: '2026-10-28T07:11:00-04:00', job: 'alpha', status: 'retry', owner: 'Rook' }),
        JSON.stringify({ at: '2026-10-28T07:12:00-04:00', job: 'alpha', status: 'retry', owner: 'Rook' }),
        JSON.stringify({ at: '2026-10-28T07:13:00-04:00', job: 'alpha', status: 'retry', owner: 'Rook' }),
        JSON.stringify({ at: '2026-10-28T07:14:00-04:00', job: 'alpha', status: 'fail', owner: 'Rook', error: 'disk full' }),
      ].join('\n'),
    );
    const app = createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir });

    const [page, api] = await Promise.all([
      app.request('/digest/2026-10-28'),
      app.request('/api/digest/2026-10-28'),
    ]);
    const html = await page.text();
    const digest = await api.json();

    expect(page.status).toBe(200);
    expect(api.status).toBe(200);
    expect(digest).toMatchObject({
      badLines: 0,
      rows: [
        { job: 'alpha', owner: 'Rook', runs: 4, retries: 3, lastStatus: 'fail', lastError: 'disk full', hasFailure: true },
        { job: 'zeta', owner: null, runs: 1, retries: 1, lastStatus: 'retry', lastError: null, hasFailure: false },
      ],
    });
    expect(JSON.stringify(digest)).toContain('2026-10-28T07:10:00-04:00');
    expect(JSON.stringify(digest)).toContain('2026-10-28T07:14:00-04:00');
    expect(html.indexOf('alpha')).toBeLessThan(html.indexOf('zeta'));
    expect(html).toContain('2026-10-28T07:10:00-04:00');
    expect(html).toContain('2026-10-28T07:14:00-04:00');
    expect(html).toContain('Rook');
    expect(html).toContain('—');
    expect(html).toContain('disk full');
    expect(html).toMatch(/warning|failed|failure/i);
  });

  it('returns 404 for a night that has no file on both routes', async () => {
    const runsDir = makeRunsDir();
    const app = createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir });

    const [page, api] = await Promise.all([
      app.request('/digest/2026-10-29'),
      app.request('/api/digest/2026-10-29'),
    ]);

    expect(page.status).toBe(404);
    expect(api.status).toBe(404);
  });

  it('renders a present empty night on both routes', async () => {
    const runsDir = makeRunsDir();
    writeNight(runsDir, '2026-10-27', '');
    const app = createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir });

    const [page, api] = await Promise.all([
      app.request('/digest/2026-10-27'),
      app.request('/api/digest/2026-10-27'),
    ]);

    expect(page.status).toBe(200);
    expect(api.status).toBe(200);
    expect(await page.text()).toMatch(/nothing ran/i);
    expect(await api.json()).toMatchObject({ rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } });
  });

  it('counts malformed lines and still serves valid rows on both routes', async () => {
    const runsDir = makeRunsDir();
    writeNight(
      runsDir,
      '2026-10-26',
      [
        '{bad json',
        JSON.stringify({ at: '2026-10-26T08:00:00+02:00', job: 'still-ran', status: 'ok', owner: null }),
        '',
      ].join('\n'),
    );
    const app = createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir });

    const [page, api] = await Promise.all([
      app.request('/digest/2026-10-26'),
      app.request('/api/digest/2026-10-26'),
    ]);
    const html = await page.text();
    const digest = await api.json();

    expect(page.status).toBe(200);
    expect(api.status).toBe(200);
    expect(digest).toMatchObject({ badLines: 1, rows: [{ job: 'still-ran', owner: null, firstAt: '2026-10-26T08:00:00+02:00' }] });
    expect(html).toContain('still-ran');
    expect(html).toContain('2026-10-26T08:00:00+02:00');
    expect(html).toMatch(/bad line|malformed|warning/i);
  });
});
