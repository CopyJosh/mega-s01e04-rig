export type RunStatus = 'ok' | 'retry' | 'fail';

/** Counts of valid log entries, not counts of jobs. */
export type StatusCounts = Record<RunStatus, number>;

export interface DigestRow {
  job: string;
  /** Owner from the last entry; null remains a visible row. */
  owner: string | null;
  /** Total valid entries for this job, including retries and failures. */
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  /** Error from the last entry, or null when that entry has no error. */
  lastError: string | null;
  /** Original timestamp strings, with their offsets, in log order. */
  firstAt: string;
  lastAt: string;
  /** True if any entry failed, even when a later entry succeeded. */
  hasFailure: boolean;
}

export interface NightDigest {
  /** One row per job, sorted by job in ascending string order. */
  rows: DigestRow[];
  /** Nonblank lines that fail JSON parsing or record validation. */
  badLines: number;
  counts: StatusCounts;
}

/** A present empty file has found: true, empty rows, and zero counts. */
export type ReadNightResult =
  | ({ found: true } & NightDigest)
  | { found: false };

/** Synchronous reader contract; the implementation belongs in the reader module. */
export type ReadNight = (runsDir: string, night: string) => ReadNightResult;
