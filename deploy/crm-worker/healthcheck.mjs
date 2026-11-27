import { readFile } from 'node:fs/promises';

try {
  const health = JSON.parse(await readFile(process.env.AMIS_WORKER_HEALTH_FILE, 'utf8'));
  const age = Date.now() - Date.parse(health.heartbeatAt);
  const browser = await fetch('http://127.0.0.1:9223/json/version', {
    signal: AbortSignal.timeout(1500),
  });
  // Expired login is not a dead process. Restarting cannot complete an AMIS OTP.
  if (!Number.isFinite(age) || age < 0 || age > 45000 || !browser.ok) process.exitCode = 1;
} catch { process.exitCode = 1; }
