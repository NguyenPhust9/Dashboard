import nextEnv from '@next/env';
import { execFile } from 'node:child_process';
import { appendFile, mkdir, readFile, rename, stat, writeFile, unlink } from 'node:fs/promises';
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

const errorCodes = new Set(['CONFIG_INVALID', 'QUEUE_UNREACHABLE', 'QUEUE_HTTP', 'QUEUE_INVALID_RESPONSE',
  'AUTH_REQUIRED', 'CRM_REFRESH_FAILED', 'WORKER_FAILURE']);
const statuses = new Set(['starting', 'idle', 'syncing', 'error', 'auth_required']);

export class WorkerError extends Error {
  constructor(message, code = 'WORKER_FAILURE') {
    super(message);
    this.code = errorCodes.has(code) ? code : 'WORKER_FAILURE';
  }
}

export function safeErrorCode(error) {
  return error instanceof WorkerError ? error.code : 'WORKER_FAILURE';
}

/** Accept only a small, documented diagnostic code, never a child's message or payload. */
export function childErrorCode(stdout) {
  if (typeof stdout !== 'string' || stdout.length > 256 * 1024) return 'CRM_REFRESH_FAILED';
  for (const line of stdout.trim().split(/\r?\n/).reverse()) {
    try {
      const result = JSON.parse(line);
      if ((result?.code || result?.errorCode) === 'AUTH_REQUIRED') return 'AUTH_REQUIRED';
    } catch { /* Ignore ordinary output; never copy it to diagnostics. */ }
  }
  return 'CRM_REFRESH_FAILED';
}

export function vietnamMonth(now = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit' })
    .format(new Date(now));
}

/** One writer chain plus same-directory rename keeps health readers from seeing partial JSON. */
export function createHealthReporter(path, { now = Date.now, intervalMs = 10000 } = {}) {
  let state = { status: 'starting', heartbeatAt: null, lastSuccessAt: null, lastErrorCode: null };
  let pending = Promise.resolve();
  let timer;
  const publish = () => {
    if (!path) return pending;
    const payload = { ...state, heartbeatAt: new Date(now()).toISOString() };
    pending = pending.then(async () => {
      const temporary = `${path}.${process.pid}.tmp`;
      try {
        await mkdir(dirname(path), { recursive: true });
        await writeFile(temporary, JSON.stringify(payload), { encoding: 'utf8', mode: 0o600 });
        await rename(temporary, path);
      } catch {
        await unlink(temporary).catch(() => {});
        // A missing health file makes the container unhealthy, but must not drop its leased job.
      }
    });
    return pending;
  };
  return {
    async start() {
      await publish();
      if (path && !timer) {
        timer = setInterval(publish, intervalMs);
        timer.unref();
      }
    },
    async update(status, { success = false, errorCode } = {}) {
      if (!statuses.has(status)) throw new TypeError('Invalid worker health status.');
      state = { ...state, status };
      if (success) { state.lastSuccessAt = new Date(now()).toISOString(); state.lastErrorCode = null; }
      if (errorCode !== undefined) state.lastErrorCode = errorCode === null ? null : errorCodes.has(errorCode) ? errorCode : 'WORKER_FAILURE';
      await publish();
    },
    async close() { clearInterval(timer); await pending; },
  };
}

/** A revision is complete only after both authoritative CRM snapshots are saved. */
export async function processClaimedJob(job, { sync, acknowledge, onSyncError = () => {} }) {
  let succeeded = true;
  try {
    await sync('staff', job.month);
    await sync('customers', job.month);
  } catch (error) {
    succeeded = false;
    await onSyncError(error);
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

export function configFromEnvironment(environment, source = {}) {
  const reportUrl = environment.DASHBOARD_REPORT26_SYNC_URL || source.DASHBOARD_REPORT26_SYNC_URL;
  const jobsUrl = environment.DASHBOARD_WEBHOOK_JOBS_URL
    || (reportUrl && new URL('/api/amis-webhook/jobs', reportUrl).href);
  const secret = environment.AMIS_REPORT_SYNC_SECRET || source.DASHBOARD_REPORT_SYNC_SECRET;
  if (!jobsUrl || !secret) throw new WorkerError('Missing webhook jobs URL or report sync secret.', 'CONFIG_INVALID');
  const destination = new URL(jobsUrl);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(destination.hostname);
  if (destination.username || destination.password
    || (destination.protocol !== 'https:' && !(local && destination.protocol === 'http:'))) {
    throw new WorkerError('Webhook jobs URL must use HTTPS (or HTTP on localhost).', 'CONFIG_INVALID');
  }
  const refreshSeconds = environment.AMIS_WORKER_REFRESH_SECONDS === undefined || environment.AMIS_WORKER_REFRESH_SECONDS === ''
    ? 0 : Number(environment.AMIS_WORKER_REFRESH_SECONDS);
  if (!Number.isSafeInteger(refreshSeconds) || (refreshSeconds !== 0 && refreshSeconds < 60)
    || refreshSeconds > 86400) {
    throw new WorkerError('AMIS_WORKER_REFRESH_SECONDS must be 0 (disabled) or an integer from 60 to 86400.', 'CONFIG_INVALID');
  }
  return { jobsUrl: destination.href, secret, refreshSeconds };
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
    throw new WorkerError('Webhook queue is unreachable; pending work remains in the queue.', 'QUEUE_UNREACHABLE');
  }
  if (acknowledgement && response.status === 409) return false;
  if (!response.ok) throw new WorkerError(`Webhook queue returned HTTP ${response.status}; pending work remains in the queue.`, 'QUEUE_HTTP');
  let result;
  try { result = await response.json(); } catch { throw new WorkerError('Invalid webhook queue response.', 'QUEUE_INVALID_RESPONSE'); }
  if (acknowledgement) {
    if (result?.ok !== true) throw new WorkerError('Invalid webhook acknowledgement.', 'QUEUE_INVALID_RESPONSE');
    return true;
  }
  if (result?.job === null) return null;
  if (!isClaimedJob(result?.job)) throw new WorkerError('Invalid webhook job; no CRM sync was started.', 'QUEUE_INVALID_RESPONSE');
  return result.job;
}

async function sync(kind, month) {
  try {
    await execFileAsync(process.execPath, [resolve(root, 'scripts', syncScripts[kind]), '--month', month], {
      cwd: root, timeout: 180000, windowsHide: true, maxBuffer: 256 * 1024,
    });
  } catch (error) {
    await log(`CRM ${kind} refresh failed for ${month}; retaining the last saved snapshot.`);
    // Do not forward child stdout/stderr: it can include source API diagnostics.
    throw new WorkerError('CRM snapshot refresh failed.', childErrorCode(error?.stdout));
  }
}

/** Claim first so a periodic fallback cannot repeatedly jump ahead of webhook work. */
export async function runWorkerCycle(config, state, {
  claim, sync: synchronize, acknowledge, health, now = Date.now, shouldStop = () => false,
}) {
  const job = await claim();
  if (state.lastErrorCode?.startsWith('QUEUE_')) {
    // Queue recovery does not restore an expired CRM login. Keep that earlier diagnosis.
    state.lastErrorCode = state.lastCrmErrorCode || null;
    await health.update(state.lastErrorCode === 'AUTH_REQUIRED' ? 'auth_required' : state.lastErrorCode ? 'error' : 'idle', {
      errorCode: state.lastErrorCode,
    });
  }
  const month = vietnamMonth(now());
  if (job) {
    let syncFailed = false;
    await health.update('syncing');
    const outcome = await processClaimedJob(job, {
      sync: synchronize, acknowledge,
      onSyncError: async error => {
        syncFailed = true;
        state.lastErrorCode = safeErrorCode(error);
        state.lastCrmErrorCode = state.lastErrorCode;
        await health.update(state.lastErrorCode === 'AUTH_REQUIRED' ? 'auth_required' : 'error', { errorCode: state.lastErrorCode });
      },
    });
    if (job.month === month && config.refreshSeconds) state.nextRefreshAt = now() + config.refreshSeconds * 1000;
    if (!syncFailed) {
      state.lastErrorCode = null;
      state.lastCrmErrorCode = null;
      await health.update('idle', { success: true });
    }
    return { outcome, month: job.month, attempt: job.attempt };
  }
  if (config.refreshSeconds && now() >= state.nextRefreshAt && !shouldStop()) {
    await health.update('syncing');
    try {
      await synchronize('staff', month);
      await synchronize('customers', month);
      state.lastErrorCode = null;
      state.lastCrmErrorCode = null;
      await health.update('idle', { success: true });
    } catch (error) {
      state.lastCrmErrorCode = safeErrorCode(error);
      throw error;
    } finally {
      // Back off periodic failures too; leased jobs retain their own durable retry schedule.
      state.nextRefreshAt = now() + config.refreshSeconds * 1000;
    }
    return { outcome: 'periodic', month };
  }
  await health.update(state.lastErrorCode === 'AUTH_REQUIRED' ? 'auth_required' : state.lastErrorCode ? 'error' : 'idle');
  return { outcome: 'idle' };
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
  nextEnv.loadEnvConfig(root, undefined, { info() {}, error() {} });
  const health = createHealthReporter(process.env.AMIS_WORKER_HEALTH_FILE && resolve(root, process.env.AMIS_WORKER_HEALTH_FILE));
  await health.start();
  let config;
  try {
    config = configFromEnvironment(process.env, await sourceConfig());
  } catch {
    await health.update('error', { errorCode: 'CONFIG_INVALID' });
    await health.close();
    throw new WorkerError('Invalid CRM worker configuration; check URL, sync secret and refresh interval.', 'CONFIG_INVALID');
  }
  const deadline = Date.now() + runFor * 1000;
  const state = { nextRefreshAt: 0, lastErrorCode: null, lastCrmErrorCode: null };
  let stopped = false;
  let failures = 0;
  let wake;
  const stop = () => { stopped = true; wake?.(); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  await log('CRM webhook worker started; checking for pending updates every 5 seconds.');
  if (config.refreshSeconds) await log(`Periodic CRM ranking refresh enabled every ${config.refreshSeconds} seconds.`);
  try {
    while (!stopped && Date.now() < deadline) {
      try {
        const result = await runWorkerCycle(config, state, {
          claim: () => request(config, { action: 'claim' }), sync, health,
          shouldStop: () => stopped || Date.now() >= deadline,
          acknowledge: (action, currentJob) => request(config, {
            action, month: currentJob.month, leaseToken: currentJob.leaseToken, revision: currentJob.revision,
          }, true),
        });
        if (result.outcome === 'complete' || result.outcome === 'periodic') {
          await log(`Both CRM ranking snapshots updated for ${result.month}${result.outcome === 'periodic' ? ' (periodic refresh)' : ''}.`);
        } else if (result.outcome === 'retry') {
          await log(`CRM refresh queued for retry for ${result.month}, attempt ${result.attempt}.`);
          if (once) process.exitCode = 1;
        } else if (result.outcome === 'stale') {
          await log(`CRM job lease changed for ${result.month}; its acknowledgement was safely ignored.`);
        } else if (once) await log('No pending CRM update.');
        failures = 0;
      } catch (error) {
        failures += 1;
        state.lastErrorCode = safeErrorCode(error);
        await health.update(state.lastErrorCode === 'AUTH_REQUIRED' ? 'auth_required' : 'error', { errorCode: state.lastErrorCode });
        await log(error instanceof WorkerError ? error.message : 'Webhook worker could not process the update; it remains pending.');
        if (once) process.exitCode = 1;
      }
      if (once || stopped || Date.now() >= deadline) break;
      const delay = Math.min(failures ? Math.min(60000, 5000 * 2 ** Math.min(failures - 1, 4)) : 5000, deadline - Date.now());
      await new Promise(resolveWait => {
        const timer = setTimeout(() => { wake = undefined; resolveWait(); }, delay);
        wake = () => { clearTimeout(timer); wake = undefined; resolveWait(); };
      });
    }
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    await health.close();
    await log('CRM webhook worker stopped.');
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(async error => {
    await log(error instanceof WorkerError ? error.message : 'Unable to start the CRM webhook worker; check its local configuration.');
    process.exitCode = 1;
  });
}
