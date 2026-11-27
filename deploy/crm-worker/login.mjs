import { spawn } from 'node:child_process';

// This is enabled explicitly through supervisorctl for at most 15 minutes.
// Docker publishes 6080 only on the host's loopback interface; use an SSH tunnel.
const children = [];
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  clearTimeout(expiry);
  for (const child of children) child.kill('SIGTERM');
}
const expiry = setTimeout(stop, 15 * 60 * 1000);
for (const [command, args] of [
  ['x11vnc', ['-display', ':99', '-localhost', '-rfbport', '5900', '-nopw', '-forever', '-shared']],
  ['websockify', ['--web=/usr/share/novnc/', '0.0.0.0:6080', '127.0.0.1:5900']],
]) {
  const child = spawn(command, args, { stdio: 'ignore' });
  children.push(child);
  child.on('error', () => { process.exitCode = 1; stop(); });
  child.on('exit', () => { if (!stopping) { process.exitCode = 1; stop(); } });
}
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
console.log('Private CRM login window enabled for 15 minutes.');
