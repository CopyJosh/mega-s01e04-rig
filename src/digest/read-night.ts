import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, ReadNight, RunStatus, StatusCounts } from './types.js';

interface RunEntry {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
}

function isTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)) {
    return false;
  }
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(Date.parse(value)) && Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value.slice(0, 10);
}

function isRunEntry(value: unknown): value is RunEntry {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  return isTimestamp(entry.at) &&
    typeof entry.job === 'string' && entry.job.trim().length > 0 &&
    (entry.status === 'ok' || entry.status === 'retry' || entry.status === 'fail') &&
    (entry.owner === null || typeof entry.owner === 'string') &&
    (!('error' in entry) || typeof entry.error === 'string');
}

export const readNight: ReadNight = (runsDir, night) => {
  // Route parameters must select a night, never a path outside the runs directory.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return { found: false };

  let contents: string;
  try {
    contents = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return { found: false };
    }
    throw error;
  }

  const jobs = new Map<string, DigestRow>();
  const counts: StatusCounts = { ok: 0, retry: 0, fail: 0 };
  let badLines = 0;

  for (const line of contents.split('\n')) {
    if (!line.trim()) continue;
    let entry: unknown;
    try {
      entry = JSON.parse(line);
    } catch {
      badLines++;
      continue;
    }
    if (!isRunEntry(entry)) {
      badLines++;
      continue;
    }

    counts[entry.status]++;
    const previous = jobs.get(entry.job);
    jobs.set(entry.job, {
      job: entry.job,
      owner: entry.owner,
      runs: (previous?.runs ?? 0) + 1,
      retries: (previous?.retries ?? 0) + (entry.status === 'retry' ? 1 : 0),
      lastStatus: entry.status,
      lastError: entry.error ?? null,
      firstAt: previous?.firstAt ?? entry.at,
      lastAt: entry.at,
      hasFailure: (previous?.hasFailure ?? false) || entry.status === 'fail',
    });
  }

  return {
    found: true,
    rows: [...jobs.keys()].sort().map((job) => jobs.get(job)!),
    badLines,
    counts,
  };
};
