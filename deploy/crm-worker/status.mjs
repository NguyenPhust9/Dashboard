import { readFile } from 'node:fs/promises';

try {
  const health = JSON.parse(await readFile(process.env.AMIS_WORKER_HEALTH_FILE, 'utf8'));
  const statuses = new Set(['starting', 'idle', 'syncing', 'error', 'auth_required']);
  console.log(JSON.stringify({
    status: statuses.has(health.status) ? health.status : 'unknown',
    heartbeatAt: health.heartbeatAt,
    lastSuccessAt: health.lastSuccessAt,
    needsLogin: health.status === 'auth_required',
  }, null, 2));
} catch {
  console.error('Worker status is not available yet.');
  process.exitCode = 1;
}
