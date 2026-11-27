import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

let stopped = false;
let child;
const stop = () => { stopped = true; child?.kill('SIGTERM'); };
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
for (let attempts = 0; attempts < 120 && !stopped; attempts += 1) {
  const ready = await fetch('http://127.0.0.1:9223/json/version', {
    signal: AbortSignal.timeout(1000),
  }).then(response => response.ok, () => false);
  if (stopped) break;
  if (ready) {
    child = spawn(process.execPath, ['scripts/amis-webhook-worker.mjs'], { stdio: 'inherit' });
    child.on('error', () => { console.error('Unable to start CRM worker.'); process.exitCode = 1; });
    await new Promise(resolve => child.once('close', (code, signal) => {
      process.exitCode = stopped ? 0 : (code ?? (signal ? 1 : 0)); resolve();
    }));
    break;
  }
  await delay(1000);
}
if (!stopped && !child) { console.error('Waiting for CRM browser failed.'); process.exitCode = 1; }
