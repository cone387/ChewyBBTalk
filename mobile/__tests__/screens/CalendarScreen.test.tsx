jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity',
  ScrollView: 'ScrollView', ActivityIndicator: 'ActivityIndicator',
  StyleSheet: { create: (value: unknown) => value },
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
// The focus mock mirrors navigation semantics: the effect auto-runs when its
// callback identity changes (month/retry dep updates) and cleans up the old one.
jest.mock('@react-navigation/native', () => {
  const state: any = { lastCb: null, cleanup: null, navigate: jest.fn() };
  return {
    __esModule: true,
    useFocusEffect: jest.fn((cb: any) => {
      if (state.lastCb !== cb) {
        state.lastCb = cb;
        state.cleanup?.();
        state.cleanup = cb();
      }
    }),
    useNavigation: () => ({ navigate: state.navigate }),
    __state: state,
  };
});
jest.mock('../../src/theme/ThemeContext', () => ({ useTheme: () => ({ theme: require('../../src/theme/themes').THEMES[0] }) }));
jest.mock('../../src/services/api/bbtalkApi', () => ({ bbtalkApi: { getDateCounts: jest.fn() } }));
jest.mock('../../src/services/historyPrivacy', () => ({
  historyIsLocked: jest.fn(() => false),
  recordHistoryActivity: jest.fn(),
}));

import React from 'react';
import CalendarScreen from '../../src/screens/CalendarScreen';
import { THEMES } from '../../src/theme/themes';

const { create, act } = require('react-test-renderer');
const NavState: any = require('@react-navigation/native').__state;
const { bbtalkApi } = require('../../src/services/api/bbtalkApi');
const privacy: any = require('../../src/services/historyPrivacy');

let tree: any;
let onSelectDate: jest.Mock;
const settle = async (rounds = 3) => {
  for (let i = 0; i < rounds; i += 1) await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0); }); });
};

const pad2 = (n: number) => String(n).padStart(2, '0');
const NOW = new Date();
const Y = NOW.getFullYear();
const M = NOW.getMonth() + 1;
const key = (day: number) => `${Y}-${pad2(M)}-${pad2(day)}`;

const childText = (children: any): string =>
  typeof children === 'string' ? children
    : typeof children === 'number' ? String(children)
      : Array.isArray(children) ? children.map(childText).join('')
        : '';
const hasText = (s: string) => tree.root.findAllByType('Text').some((t: any) => childText(t.props.children) === s);
const dayCells = () => tree.root.findAllByType('TouchableOpacity')
  .filter((n: any) => /^\d{4}-\d{2}-\d{2}，/.test(String(n.props.accessibilityLabel ?? '')));
const dayCell = (k: string) => dayCells().find((n: any) => n.props.accessibilityLabel.startsWith(k));
const buttonByText = (s: string) => {
  const matches = tree.root.findAllByType('TouchableOpacity').filter((n: any) =>
    n.findAllByType('Text').some((t: any) => childText(t.props.children).includes(s)));
  return matches.find((n: any) => !matches.some((other: any) => other !== n && n.findAllByType('TouchableOpacity').includes(other)));
};
const tappable = (label: string) => {
  const matches = tree.root.findAllByType('TouchableOpacity').filter((n: any) => n.props.accessibilityLabel === label);
  return matches.find((n: any) => !matches.some((other: any) => other !== n && n.findAllByType('TouchableOpacity').includes(other)));
};
async function press(node: any) { await act(async () => { void node.props.onPress(); }); await settle(); }

beforeEach(() => {
  jest.clearAllMocks();
  onSelectDate = jest.fn();
  NavState.lastCb = null;
  NavState.cleanup = null;
  privacy.historyIsLocked.mockReturnValue(false);
  (bbtalkApi.getDateCounts as jest.Mock).mockReset().mockResolvedValue([]);
});

afterEach(() => { act(() => { tree?.unmount(); }); tree = undefined; });

async function mount(selectedDate: string | null = null) {
  await act(async () => { tree = create(<CalendarScreen selectedDate={selectedDate} onSelectDate={onSelectDate} />); });
  await settle();
}

describe('CalendarScreen loading states', () => {
  it('maps day counts, renders the summary and enables recorded days', async () => {
    (bbtalkApi.getDateCounts as jest.Mock).mockResolvedValue([
      { date: key(1), count: 1 }, { date: key(15), count: 2 },
    ]);
    await mount();
    expect(bbtalkApi.getDateCounts).toHaveBeenCalledWith({ year: Y, month: M });
    expect(dayCell(key(1))!.props.accessibilityLabel).toBe(`${key(1)}，1条记录`);
    expect(dayCell(key(1))!.props.accessibilityState).toEqual({ selected: false, disabled: false });
    expect(dayCell(key(2))!.props.accessibilityState).toEqual({ selected: false, disabled: true });
    expect(tree.root.findAllByType('ActivityIndicator')).toHaveLength(0);
    expect(hasText('本月记录了 2 天，共 3 条碎碎念')).toBe(true);
  });

  it('suggests other months when the month is empty', async () => {
    await mount();
    expect(hasText('这个月还没有记录，试试其他月份。')).toBe(true);
    expect(dayCells().every((n: any) => n.props.accessibilityState.disabled)).toBe(true);
  });

  it('keeps days disabled behind a spinner while fetching', async () => {
    let resolveFetch!: (v: Array<{ date: string; count: number }>) => void;
    (bbtalkApi.getDateCounts as jest.Mock).mockImplementation(() => new Promise((resolve) => { resolveFetch = resolve; }));
    await act(async () => { tree = create(<CalendarScreen selectedDate={null} onSelectDate={onSelectDate} />); });
    await settle();
    expect(tree.root.findAllByType('ActivityIndicator')).toHaveLength(1);
    expect(dayCells().every((n: any) => n.props.disabled)).toBe(true);

    await act(async () => { resolveFetch([]); });
    await settle();
    expect(tree.root.findAllByType('ActivityIndicator')).toHaveLength(0);
  });

  it('offers a retry after a failure and refetches the same month', async () => {
    (bbtalkApi.getDateCounts as jest.Mock)
      .mockRejectedValueOnce(new Error('server down'))
      .mockResolvedValue([{ date: key(3), count: 4 }]);
    await mount();
    expect(hasText('加载失败，点击重试')).toBe(true);
    expect(dayCells().every((n: any) => n.props.accessibilityState.disabled)).toBe(true);

    await press(buttonByText('加载失败，点击重试'));
    expect(bbtalkApi.getDateCounts).toHaveBeenCalledTimes(2);
    expect(bbtalkApi.getDateCounts).toHaveBeenLastCalledWith({ year: Y, month: M });
    expect(hasText('本月记录了 1 天，共 4 条碎碎念')).toBe(true);
  });
});

describe('CalendarScreen day selection', () => {
  it('notifies the parent and navigates to the records list', async () => {
    (bbtalkApi.getDateCounts as jest.Mock).mockResolvedValue([{ date: key(1), count: 2 }]);
    await mount();
    await press(dayCell(key(1)));
    expect(onSelectDate).toHaveBeenCalledWith(key(1));
    expect(NavState.navigate).toHaveBeenCalledWith('Records');
  });

  it('highlights the selected and today cells', async () => {
    (bbtalkApi.getDateCounts as jest.Mock).mockResolvedValue([{ date: key(1), count: 1 }]);
    await mount(key(1));
    const selected = dayCell(key(1))!;
    expect(selected.props.accessibilityState.selected).toBe(true);
    expect(selected.props.style.some((s: any) => s?.backgroundColor === THEMES[0].colors.primary)).toBe(true);
    expect(NOW.getFullYear() === Y).toBe(true); // sanity: today lives in the initial month
    const todayCell = dayCells().find((n: any) =>
      n.props.style.some((s: any) => s?.borderColor === THEMES[0].colors.primary));
    expect(todayCell).toBeDefined();
    expect(todayCell!.props.accessibilityLabel.startsWith(`${key(NOW.getDate())}，`)).toBe(true);
  });

  it('ignores presses and responses while history is locked', async () => {
    privacy.historyIsLocked.mockReturnValue(true);
    (bbtalkApi.getDateCounts as jest.Mock).mockResolvedValue([{ date: key(1), count: 1 }]);
    await mount();
    expect(hasText('这个月还没有记录，试试其他月份。')).toBe(true);
    await act(async () => { void dayCell(key(1))!.props.onPress(); });
    expect(onSelectDate).not.toHaveBeenCalled();
    expect(NavState.navigate).not.toHaveBeenCalled();
  });
});

describe('CalendarScreen month navigation', () => {
  const monthTitle = (year: number, month: number) => `${year}年${month}月`;

  it('steps to adjacent months and back to the current one', async () => {
    await mount();
    expect(hasText(monthTitle(Y, M))).toBe(true);

    const prev = new Date(Y, M - 2, 1);
    await press(tappable('上个月'));
    expect(hasText(monthTitle(prev.getFullYear(), prev.getMonth() + 1))).toBe(true);
    expect(bbtalkApi.getDateCounts).toHaveBeenLastCalledWith({ year: prev.getFullYear(), month: prev.getMonth() + 1 });

    await press(buttonByText('回到本月'));
    expect(hasText(monthTitle(Y, M))).toBe(true);

    const next = new Date(Y, M, 1);
    await press(tappable('下个月'));
    expect(hasText(monthTitle(next.getFullYear(), next.getMonth() + 1))).toBe(true);
    expect(bbtalkApi.getDateCounts).toHaveBeenLastCalledWith({ year: next.getFullYear(), month: next.getMonth() + 1 });
  });

  it('pads the final week with empty cells for months that need them', async () => {
    await mount();
    let offset = 0;
    for (let i = 1; i <= 12; i += 1) {
      const first = new Date(Y, M - 1 + i, 1);
      if ((first.getDay() + new Date(Y, M - 1 + i + 1, 0).getDate()) % 7 !== 0) { offset = i; break; }
    }
    expect(offset).toBeGreaterThan(0);
    for (let i = 0; i < offset; i += 1) await press(tappable('下个月'));
    const target = new Date(Y, M - 1 + offset, 1);
    const daysInMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    expect(dayCells()).toHaveLength(daysInMonth);
  });

  it('keeps the error state clean when a stale request fails', async () => {
    let rejectFirst!: (e: Error) => void;
    (bbtalkApi.getDateCounts as jest.Mock).mockImplementationOnce(() =>
      new Promise((_resolve, reject) => { rejectFirst = reject; }));
    await mount();
    await press(tappable('下个月'));
    await act(async () => { rejectFirst(new Error('stale failure')); });
    await settle();
    expect(hasText('加载失败，点击重试')).toBe(false);
    expect(hasText('这个月还没有记录，试试其他月份。')).toBe(true);
  });

  it('discards a stale response after the month changes', async () => {
    const next = new Date(Y, M, 1);
    const resolvers: Array<(v: Array<{ date: string; count: number }>) => void> = [];
    (bbtalkApi.getDateCounts as jest.Mock).mockImplementation(() => new Promise((resolve) => { resolvers.push(resolve); }));
    await mount();
    await press(tappable('下个月'));
    expect(resolvers).toHaveLength(2);

    // The stale first-month response must not populate the new month grid.
    await act(async () => { resolvers[0]!([{ date: key(1), count: 9 }]); });
    await settle();
    expect(dayCells().some((n: any) => n.props.accessibilityLabel.includes('9条'))).toBe(false);
    expect(hasText('本月记录了 1 天，共 1 条碎碎念')).toBe(false);

    await act(async () => { resolvers[1]!([{ date: `${next.getFullYear()}-${pad2(next.getMonth() + 1)}-05`, count: 1 }]); });
    await settle();
    expect(hasText('本月记录了 1 天，共 1 条碎碎念')).toBe(true);
  });
});

describe('CalendarScreen history activity', () => {
  it('records activity when the calendar is touched', async () => {
    await mount();
    await act(async () => { void tree.root.findByType('ScrollView').props.onTouchStart(); });
    expect(privacy.recordHistoryActivity).toHaveBeenCalledTimes(1);
  });
});
