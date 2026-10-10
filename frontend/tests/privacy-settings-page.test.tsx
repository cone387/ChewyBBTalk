import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PrivacySettingsPage from '../src/pages/PrivacySettingsPage';

const boundary = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock('react-router-dom', () => ({ useNavigate: () => boundary.navigate }));

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
});
afterEach(() => { cleanup(); delete window.__BBTALK_CONFIG__; });

function slider(view: ReturnType<typeof render>) {
  return view.container.querySelector('input[type="range"]') as HTMLInputElement;
}
function toggle() { return screen.getByRole('checkbox'); }

describe('PrivacySettingsPage', () => {
  it('uses deployment defaults while preserving personal preferences and empty-value fallback', () => {
    window.__BBTALK_CONFIG__ = { VITE_PRIVACY_TIMEOUT_MINUTES: '12', VITE_SHOW_PRIVACY_COUNTDOWN: 'true' };
    const first = render(<PrivacySettingsPage />);
    expect(slider(first).value).toBe('12');
    expect(toggle().checked).toBe(true);
    first.unmount();
    localStorage.setItem('privacy_timeout_minutes', '30');
    localStorage.setItem('show_privacy_countdown', 'false');
    const second = render(<PrivacySettingsPage />);
    expect(slider(second).value).toBe('30');
    expect(toggle().checked).toBe(false);
    second.unmount();
    localStorage.clear();
    window.__BBTALK_CONFIG__.VITE_PRIVACY_TIMEOUT_MINUTES = '';
    const third = render(<PrivacySettingsPage />);
    expect(slider(third).value).toBe('5');
  });

  it('falls back to environment defaults and navigates back to settings', () => {
    const view = render(<PrivacySettingsPage />);
    expect(slider(view).value).toBe('5');
    expect(toggle().checked).toBe(false);
    fireEvent.click(screen.getByLabelText('返回我的'));
    expect(boundary.navigate).toHaveBeenCalledWith('/settings');
  });

  it('restores saved preferences from localStorage', () => {
    localStorage.setItem('privacy_timeout_minutes', '30');
    localStorage.setItem('show_privacy_countdown', 'true');
    const view = render(<PrivacySettingsPage />);
    expect(screen.getByText('30 分钟')).toBeTruthy();
    expect(slider(view).value).toBe('30');
    expect(toggle().checked).toBe(true);
  });

  it('persists the timeout immediately while dragging the slider', () => {
    const view = render(<PrivacySettingsPage />);
    fireEvent.change(slider(view), { target: { value: '17' } });
    expect(screen.getByText('17 分钟')).toBeTruthy();
    expect(localStorage.getItem('privacy_timeout_minutes')).toBe('17');
    // The saved value wins over the environment default on the next visit.
    localStorage.setItem('show_privacy_countdown', 'false');
    view.unmount();
    render(<PrivacySettingsPage />);
    expect(screen.getByText('17 分钟')).toBeTruthy();
    expect(toggle().checked).toBe(false);
  });

  it('persists the countdown toggle in both directions', () => {
    render(<PrivacySettingsPage />);
    fireEvent.click(toggle());
    expect(toggle().checked).toBe(true);
    expect(localStorage.getItem('show_privacy_countdown')).toBe('true');
    fireEvent.click(toggle());
    expect(toggle().checked).toBe(false);
    expect(localStorage.getItem('show_privacy_countdown')).toBe('false');
  });

  it('always shows the auto-save hint', () => {
    render(<PrivacySettingsPage />);
    expect(screen.getByText('设置自动保存，立即生效')).toBeTruthy();
    expect(screen.getByText('长时间不活动后，内容将自动模糊以保护隐私')).toBeTruthy();
  });
});
