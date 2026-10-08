// Gesture-driven viewer: the Animated value instances and PanResponder config
// are captured inside the react-native factory and exposed via __-members.
jest.mock('react-native', () => {
  const values: any[] = [];
  class AnimatedValue {
    value: number;
    constructor(initial: number) { this.value = initial; values.push(this); }
    setValue(v: number) { this.value = v; }
    __getValue() { return this.value; }
  }
  let panConfig: any = null;
  return {
    View: 'View',
    StyleSheet: { create: (value: unknown) => value },
    Dimensions: { get: () => ({ width: 390, height: 844 }) },
    Animated: {
      Value: AnimatedValue,
      View: 'AnimatedView',
      spring: jest.fn(() => ({ start: jest.fn() })),
    },
    PanResponder: {
      create: (config: any) => { panConfig = config; return { panHandlers: { gestureBound: true } }; },
    },
    __panConfig: () => panConfig,
    __values: values,
  };
});

jest.mock('expo-image', () => ({ Image: 'ExpoImage' }));
jest.mock('../../src/utils/imageSource', () => ({ buildImageSource: (url: string) => ({ uri: url }) }));

import React from 'react';
import ImageViewer from '../../src/components/ImageViewer';

const { create, act } = require('react-test-renderer');

const RN: any = require('react-native');
const panConfig = () => RN.__panConfig();
const touch = (x: number, y: number) => ({ pageX: x, pageY: y });
const distance = (a: number, b: number) => Math.hypot(a, b);

let tree: any;

beforeEach(() => {
  jest.clearAllMocks();
  RN.__values.length = 0;
});

afterEach(() => { act(() => { tree?.unmount(); }); tree = undefined; });

async function mountViewer() {
  await act(async () => { tree = create(<ImageViewer imageUrl="https://img.example/a.png" onClose={jest.fn()} />); });
}

const grant = (touches: any[]) => panConfig().onPanResponderGrant({ nativeEvent: { touches } });
const move = (touches: any[], gesture: any) => panConfig().onPanResponderMove({ nativeEvent: { touches } }, gesture);
const release = (touches: any[], gesture: any) => panConfig().onPanResponderRelease({ nativeEvent: { touches } }, gesture);
const springCallsTo = (instance: any, toValue: number) =>
  RN.Animated.spring.mock.calls.filter((call: any[]) => call[0] === instance && call[1].toValue === toValue).length;

describe('ImageViewer rendering', () => {
  it('shows the image full-screen with gesture handlers attached', async () => {
    await mountViewer();
    const image = tree.root.findAllByType('ExpoImage')[0];
    expect(image.props.source).toEqual({ uri: 'https://img.example/a.png' });
    expect(image.props.contentFit).toBe('contain');
    expect(image.props.cachePolicy).toBe('disk');
    expect(tree.root.findAllByType('View')[0].props.gestureBound).toBe(true);
  });

  it('claims both touch-down and move gestures eagerly', async () => {
    await mountViewer();
    expect(panConfig().onStartShouldSetPanResponder()).toBe(true);
    expect(panConfig().onMoveShouldSetPanResponder()).toBe(true);
  });

  it('ignores moves that are neither single-finger nor an active pinch', async () => {
    await mountViewer();
    const translateX = RN.__values[1];
    const translateY = RN.__values[2];
    // No grant happened, so a two-finger move is not an active pinch; with
    // more than one touch it is also not a pan — nothing should change.
    move([touch(0, 0), touch(40, 0)], { dx: 25, dy: 30 });
    expect(translateX.__getValue()).toBe(0);
    expect(translateY.__getValue()).toBe(0);
  });
});

describe('ImageViewer double-tap zoom', () => {
  it('zooms in on a quick second tap and toggles back out', async () => {
    const nowSpy = jest.spyOn(Date, 'now')
      .mockReturnValueOnce(1000).mockReturnValueOnce(1200)
      .mockReturnValueOnce(2000).mockReturnValueOnce(2200);
    await mountViewer();
    const scale = RN.__values[0];
    const translateX = RN.__values[1];
    const translateY = RN.__values[2];

    grant([touch(10, 10)]);
    grant([touch(12, 12)]);
    expect(springCallsTo(scale, 2.5)).toBe(1);
    expect(springCallsTo(scale, 1)).toBe(0);

    grant([touch(20, 20)]);
    grant([touch(22, 22)]);
    expect(springCallsTo(scale, 1)).toBe(1);
    expect(springCallsTo(translateX, 0)).toBe(1);
    expect(springCallsTo(translateY, 0)).toBe(1);
    nowSpy.mockRestore();
  });

  it('treats slow taps as single taps without zooming', async () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(2000);
    await mountViewer();
    grant([touch(10, 10)]);
    grant([touch(12, 12)]);
    expect(RN.Animated.spring).not.toHaveBeenCalled();
    nowSpy.mockRestore();
  });
});

describe('ImageViewer pinch to zoom', () => {
  it('scales with two fingers, clamps, and commits the zoom on release', async () => {
    await mountViewer();
    const scale = RN.__values[0];
    grant([touch(50, 50), touch(150, 50)]);
    expect(distance(100, 0)).toBeCloseTo(100);

    move([touch(50, 50), touch(250, 50)], { dx: 0, dy: 0 });
    expect(scale.__getValue()).toBe(2);
    // Clamped above 5x.
    move([touch(50, 50), touch(700, 50)], { dx: 0, dy: 0 });
    expect(scale.__getValue()).toBe(5);

    release([], { dx: 0, dy: 0 });
    expect(RN.Animated.spring).not.toHaveBeenCalled();

    // A later pinch clamps the shrink at an absolute 0.5x floor.
    grant([touch(0, 0), touch(200, 0)]);
    move([touch(0, 0), touch(1, 0)], { dx: 0, dy: 0 });
    expect(scale.__getValue()).toBe(0.5);
  });

  it('resets when the pinch ends barely zoomed', async () => {
    await mountViewer();
    const scale = RN.__values[0];
    grant([touch(50, 50), touch(150, 50)]);
    move([touch(50, 50), touch(140, 50)], { dx: 0, dy: 0 });
    expect(scale.__getValue()).toBeCloseTo(0.9);
    release([], { dx: 0, dy: 0 });
    expect(springCallsTo(scale, 1)).toBe(1);
  });
});

describe('ImageViewer pan and close', () => {
  it('pans while zoomed and accumulates the offset across gestures', async () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(1200);
    await mountViewer();
    const translateX = RN.__values[1];
    const translateY = RN.__values[2];

    grant([touch(10, 10)]);
    grant([touch(12, 12)]); // zoomed in via double-tap
    move([touch(40, 40)], { dx: 30, dy: 40 });
    expect(translateX.__getValue()).toBe(30);
    expect(translateY.__getValue()).toBe(40);
    release([], { dx: 30, dy: 40 });

    move([touch(50, 50)], { dx: 10, dy: 0 });
    expect(translateX.__getValue()).toBe(40);
    expect(translateY.__getValue()).toBe(40);
    nowSpy.mockRestore();
  });

  it('closes after dragging down past the threshold', async () => {
    const onClose = jest.fn();
    await act(async () => { tree = create(<ImageViewer imageUrl="u" onClose={onClose} />); });
    const translateY = RN.__values[2];
    grant([touch(10, 10)]);
    move([touch(10, 160)], { dx: 0, dy: 150 });
    expect(translateY.__getValue()).toBe(150);
    release([], { dx: 0, dy: 150 });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores upward drags and snaps back for small pull-downs', async () => {
    const onClose = jest.fn();
    await act(async () => { tree = create(<ImageViewer imageUrl="u" onClose={onClose} />); });
    const translateY = RN.__values[2];
    grant([touch(10, 10)]);
    move([touch(10, 0)], { dx: 0, dy: -30 });
    expect(translateY.__getValue()).toBe(0);
    release([], { dx: 0, dy: -30 });
    expect(onClose).not.toHaveBeenCalled();
    // Even an upward release snaps back to rest.
    expect(springCallsTo(translateY, 0)).toBe(1);

    move([touch(10, 90)], { dx: 0, dy: 80 });
    release([], { dx: 0, dy: 80 });
    expect(onClose).not.toHaveBeenCalled();
    expect(springCallsTo(translateY, 0)).toBe(2);
  });
});
