jest.mock('react-native', () => ({
  __esModule: true,
  View: 'View', Text: 'Text',
  StyleSheet: { create: (value: unknown) => value },
}));
jest.mock('../../src/theme/ThemeContext', () => ({ useTheme: () => ({ theme: require('../../src/theme/themes').THEMES[0] }) }));

import React from 'react';
import { View } from 'react-native';
import SectionCard from '../../src/components/SectionCard';

const { create, act } = require('react-test-renderer');
const { THEMES } = require('../../src/theme/themes');

let tree: any;
const childText = (children: any): string =>
  typeof children === 'string' ? children : '';
const hasText = (s: string) => tree.root.findAllByType('Text').some((t: any) => childText(t.props.children) === s);

beforeEach(() => jest.clearAllMocks());
afterEach(() => { act(() => { tree?.unmount(); }); tree = undefined; });

describe('SectionCard', () => {
  it('renders a titled card with themed background', async () => {
    await act(async () => {
      tree = create(<SectionCard title="账号"><View>inner</View></SectionCard>);
    });
    expect(hasText('账号')).toBe(true);
    const card = tree.root.findAllByType('View')
      .find((n: any) => n.props.style?.some?.((s: any) => s?.backgroundColor === THEMES[0].colors.cardBg))!;
    expect(card.props.style.some((s: any) => s?.backgroundColor === THEMES[0].colors.cardBg)).toBe(true);
    expect(card.children).toHaveLength(1);
  });

  it('omits the title row when untitled', async () => {
    await act(async () => {
      tree = create(<SectionCard><View>inner</View></SectionCard>);
    });
    expect(tree.root.findAllByType('Text')).toHaveLength(0);
  });
});
