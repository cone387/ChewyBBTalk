import { WEB_FOCUS_CSS } from '../../src/utils/webFocusStyle';

describe('Web focus style', () => {
  it('provides a visible focus-visible outline instead of removing focus indication', () => {
    expect(WEB_FOCUS_CSS).toContain(':focus-visible');
    expect(WEB_FOCUS_CSS).toContain('outline: 2px solid');
    expect(WEB_FOCUS_CSS).not.toContain('outline:none');
  });
});
