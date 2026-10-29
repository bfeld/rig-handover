// Plan morning-digest § 2c. Line counts by status for one night, for the board.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseRunLine } from './read.js';

export type NightCounts = { ok: number; retry: number; fail: number; badLines: number };

export function countLines(text: string): NightCounts {
  const counts: NightCounts = { ok: 0, retry: 0, fail: 0, badLines: 0 };
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '') continue;
    const run = parseRunLine(line);
    if (run === null) counts.badLines++;
    else counts[run.status]++;
  }
  return counts;
}

// null when the night has no readable file.
export function nightCounts(runsDir: string, night: string): NightCounts | null {
  try {
    return countLines(readFileSync(join(runsDir, `${night}.jsonl`), 'utf8'));
  } catch {
    return null;
  }
}
