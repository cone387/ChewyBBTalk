jest.mock('react-native', () => ({
  __esModule: true,
  View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity',
  StyleSheet: { create: (value: unknown) => value },
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));

import React from 'react';
import ErrorFallback from '../../src/components/ErrorFallback';

const { create, act } = require('react-test-renderer');

let tree: any;
const childText = (children: any): string =>
  typeof children === 'string' ? children
    : Array.isArray(children) ? children.map(childText).join('')
      : '';
const hasText = (s: string) => tree.root.findAllByType('Text').some((t: any) => childText(t.props.children) === s);
const button = (label: string) => tree.root.findAllByType('TouchableOpacity')
  .filter((n: any) => n.findAllByType('Text').some((t: any) => childText(t.props.children) === label)).pop()!;

beforeEach(() => jest.clearAllMocks());
afterEach(() => { act(() => { tree?.unmount(); }); tree = undefined; });

async function mount(props: { onRetry?: () => void; errorMessage?: string } = {}) {
  await act(async () => {
    tree = create(<ErrorFallback onRetry={props.onRetry ?? jest.fn()} errorMessage={props.errorMessage} />);
  });
}

describe('ErrorFallback', () => {
  it('offers a retry that resets the boundary', async () => {
    const onRetry = jest.fn();
    await mount({ onRetry });
    expect(hasText('出了点问题')).toBe(true);
    expect(hasText('页面暂时无法显示，请尝试重新加载。')).toBe(true);
    await act(async () => { void button('重新加载').props.onPress(); });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('hides the details affordance without an error message', async () => {
    await mount();
    expect(hasText('查看错误详情')).toBe(false);
  });

  it('toggles the error details', async () => {
    await mount({ errorMessage: 'TypeError: boom' });
    expect(hasText('TypeError: boom')).toBe(false);
    await act(async () => { void button('查看错误详情').props.onPress(); });
    expect(hasText('TypeError: boom')).toBe(true);
    expect(hasText('收起错误详情')).toBe(true);
    await act(async () => { void button('收起错误详情').props.onPress(); });
    expect(hasText('TypeError: boom')).toBe(false);
  });
});
