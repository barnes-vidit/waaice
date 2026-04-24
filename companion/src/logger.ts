// Centralised in-memory log ring-buffer exposed via GET /debug/logs
// Every module calls log() instead of console.log for important events.

const MAX_LOGS = 200;

export interface LogEntry {
  ts: string;
  level: 'info' | 'warn' | 'error';
  tag: string;
  msg: string;
}

const buffer: LogEntry[] = [];

export function log(tag: string, msg: string, level: LogEntry['level'] = 'info') {
  const entry: LogEntry = { ts: new Date().toISOString(), level, tag, msg };
  buffer.push(entry);
  if (buffer.length > MAX_LOGS) buffer.shift();
  // also mirror to stdout so the terminal shows everything
  const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : '✅';
  console.log(`${prefix} [${tag}] ${msg}`);
}

export function getLogs(): LogEntry[] {
  return [...buffer].reverse(); // newest first
}

export function clearLogs() {
  buffer.splice(0, buffer.length);
}
