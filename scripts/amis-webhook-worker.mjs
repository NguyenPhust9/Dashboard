import nextEnv from '@next/env';
import { execFile } from 'node:child_process';
import { appendFile, mkdir, readFile, rename, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const logPath = resolve(root, 'data/amis-webhook-worker.log');
const syncScripts = {
  staff: 'crm-excellent-staff-sync.mjs',
  customers: 'crm-top-customers-sync.mjs',
};
const execFileAsync = promisify(execFile);

class WorkerError extends Error {}

/** A revision is complete only after both authoritative CRM snapshots are saved. */
export async function processClaimedJob(job, { sync, acknowledge }) {
  let succeeded = true;
  try {
    await sync('staff', job.month);
    await sync('customers', job.month);
  } catch {
    succeeded = false;
  }
  // A failed acknowledgement must leave the lease to expire, never mark it complete.
  const accepted = await acknowledge(succeeded ? 'complete' : 'fail', job);
  if (!accepted) return 'stale';
  return succeeded ? 'complete' : 'retry';
}

export function isClaimedJob(job) {
  return Boolean(job && typeof job === 'object'
    && /^\d{4}-(0[1-9]|1[0-2])$/.test(job.month)
    && typeof job.leaseToken === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(job.leaseToken)
    && Number.isSafeInteger(job.revision) && job.revision > 0
    && Number.isSafeInteger(job.attempt) && job.attempt > 0);
}

async function sourceConfig() {
  const path = process.env.BIKEFORCE_AMIS_ENV_FILE
    || (process.env.AMIS_ACCOUNTING_OVERVIEW_FILE && resolve(dirname(process.env.AMIS_ACCOUNTING_OVERVIEW_FILE), '.env'));
  if (!path) return {};
  const text = await readFile(path, 'utf8');
  return Object.fromEntries(text.replace(/^\uFEFF/, '').split(/\r?\n/).flatMap(line => {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    return match ? [[match[1], match[2].trim().replace(/^(['"])(.*)\1$/, '$2')]] : [];
  }));
}

async function readConfig() {
  nextEnv.loadEnvConfig(root, undefined, { info() {}, error() {} });
  const source = await sourceConfig();
  const reportUrl = process.env.DASHBOARD_REPORT26_SYNC_URL || source.DASHBOARD_REPORT26_SYNC_URL;
  const jobsUrl = process.env.DASHBOARD_WEBHOOK_JOBS_URL
    || (reportUrl && new URL('/api/amis-webhook/jobs', reportUrl).href);
  const secret = process.env.AMIS_REPORT_SYNC_SECRET || source.DASHBOARD_REPORT_SYNC_SECRET;
  if (!jobsUrl || !secret) throw new WorkerError('Missing webhook jobs URL or report sync secret.');
  const destination = new URL(jobsUrl);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(destination.hostname);
  if (destination.username || destination.password
    || (destination.protocol !== 'https:' && !(local && destination.protocol === 'http:'))) {
    throw new WorkerError('Webhook jobs URL must use HTTPS (or HTTP on localhost).');
  }
  return { jobsUrl: destination.href, secret };
}

async function log(message) {
  const line = `${new Date().toISOString()} ${message}\n`;
  console.log(line.trimEnd());
  try {
    await mkdir(dirname(logPath), { recursive: true });
    if ((await stat(logPath).catch(() => null))?.size > 1024 * 1024) {
      await rename(logPath, `${logPath}.previous`);
    }
    await appendFile(logPath, line, 'utf8');
  } catch {
    // Log storage must not prevent a pending CRM update from being processed.
  }
}

async function request(config, body, acknowledgement = false) {
  let response;
  try {
    response = await fetch(config.jobsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-amis-report-sync-secret': config.secret },
      body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new WorkerError('Webhook queue is unreachable; pending work remains in the queue.');
  }
  if (acknowledgement && response.status === 409) return false;
  if (!response.ok) throw new WorkerError(`Webhook queue returned HTTP ${response.status}; pending work remains in the queue.`);
  let result;
  try { result = await response.json(); } catch { throw new WorkerError('Invalid webhook queue response.'); }
  if (acknowledgement) {
    if (result?.ok !== true) throw new WorkerError('Invalid webhook acknowledgement.');
    return true;
  }
  if (result?.job === null) return null;
  if (!isClaimedJob(result?.job)) throw new WorkerError('Invalid webhook job; no CRM sync was started.');
  return result.job;
}

async function sync(kind, month) {
  try {
    await execFileAsync(process.execPath, [resolve(root, 'scripts', syncScripts[kind]), '--month', month], {
      cwd: root, timeout: 180000, windowsHide: true, maxBuffer: 256 * 1024,
    });
  } catch {
    await log(`CRM ${kind} refresh failed for ${month}; retaining the last saved snapshot.`);
    // Do not forward child stdout/stderr: it can include source API diagnostics.
    throw new WorkerError('CRM snapshot refresh failed.');
  }
}

function options(args) {
  let once = false;
  let runFor = Infinity;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--once') once = true;
    else if (args[i] === '--run-for') {
      runFor = Number(args[++i]);
      if (!Number.isFinite(runFor) || runFor <= 0) throw new WorkerError('--run-for requires a positive number of seconds.');
    } else throw new WorkerError('Supported options: --once, --run-for <seconds>.');
  }
  return { once, runFor };
}

async function main() {
  const { once, runFor } = options(process.argv.slice(2));
  const config = await readConfig();
  const deadline = Date.now() + runFor * 1000;
  let stopped = false;
  let failures = 0;
  let wake;
  const stop = () => { stopped = true; wake?.(); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  await log('CRM webhook worker started; checking for pending updates every 5 seconds.');
  try {
    do {
      let outcome;
      try {
        const job = await request(config, { action: 'claim' });
        if (job) {
          await log(`Refreshing CRM rankings for ${job.month}, attempt ${job.attempt}.`);
          outcome = await processClaimedJob(job, {
            sync,
            acknowledge: (action, currentJob) => request(config, {
              action, month: currentJob.month, leaseToken: currentJob.leaseToken, revision: currentJob.revision,
            }, true),
          });
          await log(outcome === 'complete'
            ? `Both CRM ranking snapshots updated for ${job.month}.`
            : outcome === 'retry'
              ? `CRM refresh queued for retry for ${job.month}.`
              : `CRM job lease changed for ${job.month}; its acknowledgement was safely ignored.`);
          if (once && outcome === 'retry') process.exitCode = 1;
        } else if (once) await log('No pending CRM update.');
        failures = 0;
      } catch (error) {
        failures += 1;
        await log(error instanceof WorkerError ? error.message : 'Webhook worker could not process the update; it remains pending.');
        if (once) process.exitCode = 1;
      }
      if (once || stopped || Date.now() >= deadline) break;
      const delay = Math.min(failures ? Math.min(60000, 5000 * 2 ** Math.min(failures - 1, 4)) : 5000, deadline - Date.now());
      await new Promise(resolveWait => {
        const timer = setTimeout(() => { wake = undefined; resolveWait(); }, delay);
        wake = () => { clearTimeout(timer); wake = undefined; resolveWait(); };
      });
    } while (!stopped && Date.now() < deadline);
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    await log('CRM webhook worker stopped.');
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(async error => {
    await log(error instanceof WorkerError ? error.message : 'Unable to start the CRM webhook worker; check its local configuration.');
    process.exitCode = 1;
  });
}
