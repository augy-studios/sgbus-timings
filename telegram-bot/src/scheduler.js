import { db } from "./db.js";

const CHECK_INTERVAL_MS = 60_000;

const upsertJobStmt = db.prepare(
  `INSERT INTO jobs (name, interval_ms, last_run) VALUES (?, ?, 0)
   ON CONFLICT(name) DO UPDATE SET interval_ms = excluded.interval_ms`
);
const getJobStmt = db.prepare("SELECT * FROM jobs WHERE name = ?");
const touchJobStmt = db.prepare("UPDATE jobs SET last_run = ? WHERE name = ?");

const jobs = [];

/**
 * Registers a recurring task. Due-ness is tracked in the `jobs` SQLite table
 * (name, interval_ms, last_run) so a restart does not cause the job to fire
 * immediately unless it was actually overdue.
 */
export function registerJob(name, intervalMs, fn) {
  upsertJobStmt.run(name, intervalMs);
  jobs.push({ name, fn });
}

async function runDueJobs() {
  const now = Date.now();
  for (const job of jobs) {
    const row = getJobStmt.get(job.name);
    if (!row) continue;
    if (now - row.last_run < row.interval_ms) continue;
    try {
      await job.fn();
      touchJobStmt.run(Date.now(), job.name);
    } catch (err) {
      console.error(`[scheduler] job "${job.name}" failed:`, err);
    }
  }
}

let timer = null;

/** Starts the scheduler loop. Runs an initial due-check immediately. */
export function startScheduler() {
  runDueJobs();
  timer = setInterval(runDueJobs, CHECK_INTERVAL_MS);
}

export function stopScheduler() {
  if (timer) clearInterval(timer);
}
