import React from 'react';
import { render } from '@testing-library/react-native';
import * as ScreenCapture from 'expo-screen-capture';

let mockPlatformOS = 'android';

jest.mock('react-native', () => ({
  Platform: {
    get OS() {
      return mockPlatformOS;
    },
  },
}));

jest.mock('expo-screen-capture', () => ({
  __esModule: true,
  preventScreenCaptureAsync: jest.fn(() => Promise.resolve()),
  allowScreenCaptureAsync: jest.fn(() => Promise.resolve()),
}));

import ScreenCaptureProtection from '../../src/components/ScreenCaptureProtection';

const preventScreenCaptureAsync = ScreenCapture.preventScreenCaptureAsync as jest.Mock;
const allowScreenCaptureAsync = ScreenCapture.allowScreenCaptureAsync as jest.Mock;

describe('ScreenCaptureProtection', () => {
  beforeEach(() => {
    mockPlatformOS = 'android';
    preventScreenCaptureAsync.mockClear();
    allowScreenCaptureAsync.mockClear();
  });

  it('prevents screen capture on Android and releases it on unmount', () => {
    const view = render(<ScreenCaptureProtection />);

    expect(preventScreenCaptureAsync).toHaveBeenCalledTimes(1);
    expect(allowScreenCaptureAsync).not.toHaveBeenCalled();

    view.unmount();

    expect(allowScreenCaptureAsync).toHaveBeenCalledTimes(1);
  });

  it('does nothing on web', () => {
    mockPlatformOS = 'web';

    const view = render(<ScreenCaptureProtection />);
    view.unmount();

    expect(preventScreenCaptureAsync).not.toHaveBeenCalled();
    expect(allowScreenCaptureAsync).not.toHaveBeenCalled();
  });
});