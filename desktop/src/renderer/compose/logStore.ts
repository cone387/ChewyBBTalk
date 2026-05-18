/**
 * Simple in-memory log store for debugging.
 * Logs are stored in memory and can be viewed in the Settings window.
 */

export interface LogEntry {
  timestamp: number;
  level: 'info' | 'error' | 'warn';
  message: string;
}

const MAX_LOGS = 50;
const logs: LogEntry[] = [];

export function addLog(level: LogEntry['level'], message: string): void {
  logs.push({ timestamp: Date.now(), level, message });
  if (logs.length > MAX_LOGS) logs.shift();
  // Also persist to localStorage for cross-window access
  try {
    localStorage.setItem('__bbtalk_logs', JSON.stringify(logs));
  } catch { /* ignore */ }
}

export function getLogs(): LogEntry[] {
  // Try to read from localStorage (for cross-window access)
  try {
    const stored = localStorage.getItem('__bbtalk_logs');
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return [...logs];
}

export function clearLogs(): void {
  logs.length = 0;
  try {
    localStorage.removeItem('__bbtalk_logs');
  } catch { /* ignore */ }
}
