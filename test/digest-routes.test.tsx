import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/types.js';

const line = (at: string, job: string, status: string, owner: string | null, error?: string) =>
  JSON.stringify(error === undefined ? { at, job, status, owner } : { at, job, status, owner, error });

let dir: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  mkdirSync(dir, { recursive: true });
  const normal = [
    line('2026-10-28T02:00:00+01:00', 'zeta-sync', 'ok', 'bjoern'),
    line('2026-10-28T02:05:00+01:00', 'alpha-backup', 'retry', null, 'timeout'),
    line('2026-10-28T02:10:00+01:00', 'alpha-backup', 'ok', null),
    line('2026-10-28T03:00:00+01:00', 'mid-clean', 'fail', 'sam', 'disk full'),
  ];
  writeFileSync(join(dir, '2026-10-28.jsonl'), normal.join('\n') + '\n');
  writeFileSync(join(dir, '2026-10-27.jsonl'), '');
  writeFileSync(
    join(dir, '2026-10-26.jsonl'),
    [normal[0], 'not json at all', normal[3], '{"job":"x"}'].join('\n') + '\n',
  );
  app = createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir: dir,
  });
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

const json = async (night: string) => {
  const res = await app.request(`/api/digest/${night}`);
  return { res, body: (await res.json()) as Night };
};

describe('GET /digest/:night', () => {
  it('200 with a row per job', async () => {
    const res = await app.request('/digest/2026-10-28');
    const html = await res.text();
    expect(res.status).toBe(200);
    for (const job of ['alpha-backup', 'mid-clean', 'zeta-sync']) expect(html).toContain(job);
  });

  it('404 for a night with no file', async () => {
    const res = await app.request('/digest/2026-01-01');
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('no run log');
  });

  it('empty night says nothing ran', async () => {
    const res = await app.request('/digest/2026-10-27');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('bad lines are counted and the page still renders its rows', async () => {
    const res = await app.request('/digest/2026-10-26');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('2 lines did not parse');
    expect(html).toContain('zeta-sync');
    expect(html).toContain('mid-clean');
  });
});

describe('GET /api/digest/:night', () => {
  it('200 with sorted rows', async () => {
    const { res, body } = await json('2026-10-28');
    expect(res.status).toBe(200);
    expect(body.night).toBe('2026-10-28');
    expect(body.badLines).toBe(0);
    expect(body.rows.map((r) => r.job)).toEqual(['alpha-backup', 'mid-clean', 'zeta-sync']);
  });

  it('404 for a night with no file', async () => {
    const { res, body } = await json('2026-01-01');
    expect(res.status).toBe(404);
    expect(body).toEqual({ error: 'no such night' });
  });

  it('empty night has rows: []', async () => {
    const { res, body } = await json('2026-10-27');
    expect(res.status).toBe(200);
    expect(body).toEqual({ night: '2026-10-27', rows: [], badLines: 0 });
  });

  it('bad lines are counted, rows intact', async () => {
    const { res, body } = await json('2026-10-26');
    expect(res.status).toBe(200);
    expect(body.badLines).toBe(2);
    expect(body.rows.map((r) => r.job)).toEqual(['mid-clean', 'zeta-sync']);
  });
});

describe('page and JSON agree', () => {
  it('list the same jobs in the same order', async () => {
    const html = await (await app.request('/digest/2026-10-28')).text();
    const { body } = await json('2026-10-28');
    const pageJobs = [...html.matchAll(/<tr[^>]*><td>([^<]+)<\/td>/g)].map((m) => m[1]);
    expect(pageJobs).toEqual(body.rows.map((r) => r.job));
  });
});
