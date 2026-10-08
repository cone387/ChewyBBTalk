jest.mock('react-native', () => ({ __esModule: true, View: 'View' }));

import React from 'react';
import LandingScreen from '../../src/screens/LandingScreen';

const { create, act } = require('react-test-renderer');

describe('LandingScreen (native placeholder)', () => {
  it('renders nothing on native platforms', async () => {
    let tree: any;
    await act(async () => { tree = create(<LandingScreen navigation={{} as any} />); });
    expect(tree.toJSON()).toBeNull();
    expect(tree.root.findAllByType('View')).toHaveLength(0);
    act(() => { tree.unmount(); });
  });
});
