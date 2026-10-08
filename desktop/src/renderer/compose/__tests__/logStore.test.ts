import { beforeEach, describe, expect, it } from 'vitest';
import { installMiniDom, type MiniDom } from '../../__tests__/miniDom';
import { addLog, clearLogs, getLogs, type LogEntry } from '../logStore';

let dom: MiniDom;

beforeEach(() => {
  dom = installMiniDom();
  clearLogs();
});

describe('logStore', () => {
  it('appends entries and persists them to localStorage', () => {
    addLog('error', 'boom');
    addLog('info', 'all good');
    const stored = JSON.parse(dom.window.localStorage.getItem('__bbtalk_logs')!) as LogEntry[];
    expect(stored.map(entry => entry.message)).toEqual(['boom', 'all good']);
    expect(stored[0].level).toBe('error');
    expect(stored[0].timestamp).toBeGreaterThan(0);
    expect(getLogs()).toHaveLength(2);
  });

  it('caps the in-memory history at fifty entries', () => {
    for (let i = 0; i < 55; i++) addLog('info', `entry-${i}`);
    dom.window.localStorage.clear();
    const logs = getLogs();
    expect(logs).toHaveLength(50);
    expect(logs[0].message).toBe('entry-5');
    expect(logs[49].message).toBe('entry-54');
  });

  it('prefers persisted logs so other windows can share the history', () => {
    addLog('info', 'memory only');
    dom.window.localStorage.setItem('__bbtalk_logs', JSON.stringify([{ timestamp: 1, level: 'warn', message: 'from another window' }]));
    expect(getLogs().map(entry => entry.message)).toEqual(['from another window']);
  });

  it('falls back to the in-memory history for corrupted storage', () => {
    addLog('warn', 'kept in memory');
    dom.window.localStorage.setItem('__bbtalk_logs', '{not json');
    expect(getLogs().map(entry => entry.message)).toEqual(['kept in memory']);
  });

  it('clears both storages', () => {
    addLog('info', 'one');
    clearLogs();
    expect(getLogs()).toHaveLength(0);
    expect(dom.window.localStorage.getItem('__bbtalk_logs')).toBeNull();
  });

  it('ignores storage quota failures when appending', () => {
    const original = dom.window.localStorage.setItem;
    dom.window.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
    expect(() => addLog('error', 'still recorded')).not.toThrow();
    dom.window.localStorage.setItem = original;
    expect(getLogs().map(entry => entry.message)).toEqual(['still recorded']);
  });
});
