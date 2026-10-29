import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28');

  it('gives 5 jobs sorted by job and 1 bad line', () => {
    expect(night?.night).toBe('2026-10-28');
    expect(night?.badLines).toBe(1);
    expect(night?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('counts runs and retries, keeps the last error and the offsets', () => {
    const row = night?.rows.find((r) => r.job === 'fixtures/refresh');
    expect(row).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
    const sync = night?.rows.find((r) => r.job === 'lane/sync');
    expect(sync).toMatchObject({ runs: 8, retries: 1, lastStatus: 'ok', lastError: 'lock held' });
    expect(sync?.firstAt).toBe('2026-10-28T23:00:06+01:00');
  });

  it('keeps a row whose owner is null', () => {
    const row = night?.rows.find((r) => r.job === 'digest/render');
    expect(row).toMatchObject({ owner: null, runs: 1, lastStatus: 'ok', lastError: null });
  });

  it('reports a fail as the last status', () => {
    const row = night?.rows.find((r) => r.job === 'notes/backup');
    expect(row).toMatchObject({ lastStatus: 'fail', lastError: 'quota exceeded', owner: 'lane-07' });
  });
});

describe('readNight edge cases', () => {
  let dir: string;
  const write = (night: string, text: string) => writeFileSync(join(dir, `${night}.jsonl`), text);

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('returns null when the night has no file', () => {
    expect(readNight(dir, '2026-01-01')).toBeNull();
  });

  it('returns null for a night that is not a date', () => {
    expect(readNight(dir, '../etc/passwd')).toBeNull();
  });

  it('gives no rows and no bad lines for an empty file', () => {
    write('2026-01-02', '');
    expect(readNight(dir, '2026-01-02')).toEqual({ night: '2026-01-02', rows: [], badLines: 0 });
  });

  it('counts lines that parse but are not a run line, never throws', () => {
    const ok = { at: '2026-01-03T01:00:00-05:00', job: 'a', status: 'ok', owner: 'x' };
    write(
      '2026-01-03',
      [
        JSON.stringify(ok),
        'not json',
        '[]',
        'null',
        JSON.stringify({ ...ok, status: 'done' }),
        JSON.stringify({ ...ok, owner: 7 }),
        JSON.stringify({ at: ok.at, job: 'a', status: 'ok' }),
        JSON.stringify({ ...ok, at: 'yesterday' }),
        JSON.stringify({ ...ok, job: '' }),
        JSON.stringify({ ...ok, error: 42 }),
        '',
      ].join('\n'),
    );
    const night = readNight(dir, '2026-01-03');
    expect(night?.badLines).toBe(9);
    expect(night?.rows).toHaveLength(1);
    expect(night?.rows[0]?.firstAt).toBe('2026-01-03T01:00:00-05:00');
  });
});
