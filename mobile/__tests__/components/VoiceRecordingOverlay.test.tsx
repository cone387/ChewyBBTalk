// The voice module and expo-audio mocks hold their mutable state inside the
// factory (module-load order makes outer holders unreliable), exposed via
// __-prefixed members for the tests to steer.
jest.mock('@react-native-voice/voice', () => {
  const voice = {
    onSpeechResults: null,
    onSpeechPartialResults: null,
    onSpeechError: null,
    start: jest.fn(() => Promise.resolve()),
    stop: jest.fn(() => Promise.resolve()),
    destroy: jest.fn(() => Promise.resolve()),
    removeAllListeners: jest.fn(),
  };
  return { __esModule: true, default: voice };
});

jest.mock('expo-audio', () => {
  const recorder = {
    prepareToRecordAsync: jest.fn(() => Promise.resolve()),
    record: jest.fn(),
    stop: jest.fn(() => Promise.resolve()),
    getStatus: jest.fn(() => ({ durationMillis: 0 })),
    uri: 'file://rec.m4a',
  };
  const recorderState = { durationMillis: 0, isRecording: false };
  return {
    useAudioRecorder: jest.fn(() => recorder),
    useAudioRecorderState: jest.fn(() => recorderState),
    RecordingPresets: { HIGH_QUALITY: { preset: 'high' } },
    AudioModule: { requestRecordingPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true })) },
    setAudioModeAsync: jest.fn(() => Promise.resolve()),
    __recorder: recorder,
    __recorderState: recorderState,
  };
});

const mockXAlert = jest.fn();

jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity',
  StyleSheet: { create: (value: unknown) => value, absoluteFillObject: { top: 0, left: 0, right: 0, bottom: 0 } },
  Animated: {
    View: 'AnimatedView',
    Value: function Value(this: any, _initial: number) { return {}; },
    timing: () => ({}), sequence: () => ({}),
    loop: () => ({ start: jest.fn(), stop: jest.fn() }),
  },
  AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
  BackHandler: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
}));

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('../../src/theme/ThemeContext', () => ({ useTheme: () => ({ theme: require('../../src/theme/themes').THEMES[0] }) }));
jest.mock('../../src/utils/crossAlert', () => ({ xAlert: (...args: any[]) => mockXAlert(...args) }));

import React from 'react';
import VoiceRecordingOverlay from '../../src/components/VoiceRecordingOverlay';

const { create, act } = require('react-test-renderer');

const voice: any = (require('@react-native-voice/voice') as any).default;
const audio: any = require('expo-audio');
const RN: any = require('react-native');
const recorder = audio.__recorder;
const recorderState = audio.__recorderState;

const childText = (children: any): string =>
  typeof children === 'string' ? children
    : typeof children === 'number' ? String(children)
      : Array.isArray(children) ? children.map(childText).join('')
        : '';
function tappable(label: string) {
  return tree.root.findAllByType('TouchableOpacity').find((node: any) => node.props.accessibilityLabel === label);
}
async function press(label: string) { await act(async () => { await tappable(label)!.props.onPress(); }); }

let tree: any;
const settle = async (rounds = 5) => {
  for (let i = 0; i < rounds; i += 1) await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0); }); });
};
async function mountOverlay(props: any = {}) {
  await act(async () => { tree = create(<VoiceRecordingOverlay visible onFinish={jest.fn()} onCancel={jest.fn()} {...props} />); });
  await settle();
}
const hasText = (s: string) => tree.root.findAllByType('Text').some((t: any) => childText(t.props.children) === s);

beforeEach(() => {
  jest.clearAllMocks();
  voice.onSpeechResults = null;
  voice.onSpeechPartialResults = null;
  voice.onSpeechError = null;
  recorder.prepareToRecordAsync.mockImplementation(() => Promise.resolve());
  recorder.record.mockImplementation(() => {});
  recorder.stop.mockImplementation(() => Promise.resolve());
  recorder.getStatus.mockImplementation(() => ({ durationMillis: 0 }));
  recorder.uri = 'file://rec.m4a';
  recorderState.durationMillis = 0;
  recorderState.isRecording = false;
  audio.AudioModule.requestRecordingPermissionsAsync.mockImplementation(() => Promise.resolve({ granted: true }));
  audio.setAudioModeAsync.mockImplementation(() => Promise.resolve());
  voice.start.mockImplementation(() => Promise.resolve());
  voice.stop.mockImplementation(() => Promise.resolve());
  voice.destroy.mockImplementation(() => Promise.resolve());
});

afterEach(() => { act(() => { tree?.unmount(); }); tree = undefined; });

describe('VoiceRecordingOverlay startup and finish', () => {
  it('records, transcribes, and finishes with the saved audio', async () => {
    const onFinish = jest.fn();
    await mountOverlay({ onFinish });
    expect(audio.AudioModule.requestRecordingPermissionsAsync).toHaveBeenCalled();
    expect(audio.setAudioModeAsync).toHaveBeenCalledWith({ allowsRecording: true, playsInSilentMode: true });
    expect(recorder.prepareToRecordAsync).toHaveBeenCalled();
    expect(recorder.record).toHaveBeenCalled();
    expect(voice.start).toHaveBeenCalledWith('zh-CN');

    await act(async () => { voice.onSpeechPartialResults!({ value: ['临时'] }); });
    expect(hasText('临时')).toBe(true);
    await act(async () => { voice.onSpeechResults!({ value: ['你好世界'] }); });
    expect(hasText('你好世界')).toBe(true);

    recorder.getStatus.mockImplementation(() => ({ durationMillis: 1500 }));
    await press('结束录音');
    await settle();
    expect(recorder.stop).toHaveBeenCalled();
    expect(voice.stop).toHaveBeenCalled();
    expect(audio.setAudioModeAsync).toHaveBeenLastCalledWith({ allowsRecording: false, playsInSilentMode: true });
    expect(onFinish).toHaveBeenCalledWith({ text: '你好世界', audioUri: 'file://rec.m4a', audioDuration: 2 });
  });

  it('finishes through the stopAction prop with a rounded minimum of one second', async () => {
    const onFinish = jest.fn();
    const onCancel = jest.fn();
    recorder.getStatus.mockImplementation(() => ({ durationMillis: 800 }));
    await mountOverlay({ onFinish, onCancel });
    await act(async () => {
      tree.update(<VoiceRecordingOverlay visible onFinish={onFinish} onCancel={onCancel} stopAction="finish" />);
    });
    await settle();
    expect(onFinish).toHaveBeenCalledWith({ text: '', audioUri: 'file://rec.m4a', audioDuration: 1 });
  });

  it('rejects a too-short recording with an explanation and cancels', async () => {
    const onCancel = jest.fn();
    const onFinish = jest.fn();
    recorder.getStatus.mockImplementation(() => ({ durationMillis: 300 }));
    await mountOverlay({ onFinish, onCancel });
    await press('结束录音');
    await settle();
    expect(mockXAlert).toHaveBeenCalledWith('录音太短', '请按住说话后再松手');
    expect(onFinish).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });

  it('cancels via the cancel button and releases resources without finishing', async () => {
    const onFinish = jest.fn();
    const onCancel = jest.fn();
    await mountOverlay({ onFinish, onCancel });
    await press('取消录音');
    await settle();
    expect(recorder.stop).toHaveBeenCalled();
    expect(onFinish).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });

  it('cancels through the stopAction prop', async () => {
    const onCancel = jest.fn();
    await mountOverlay({ onCancel, stopAction: 'cancel' });
    await settle();
    expect(onCancel).toHaveBeenCalled();
  });

  it('cancels when the app leaves the foreground and ignores later stop requests', async () => {
    const onCancel = jest.fn();
    await mountOverlay({ onCancel });
    await act(async () => { RN.AppState.addEventListener.mock.calls[0][1]('background'); });
    await settle();
    expect(onCancel).toHaveBeenCalledTimes(1);
    const backResult = RN.BackHandler.addEventListener.mock.calls[0][1]();
    expect(backResult).toBe(true);
    await settle();
    // The overlay settles once; a second stop request is a no-op.
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('cleans up listeners and the voice bridge on unmount without callbacks', async () => {
    const onFinish = jest.fn();
    const onCancel = jest.fn();
    await mountOverlay({ onFinish, onCancel });
    const appStateRemove = RN.AppState.addEventListener.mock.results[0].value.remove;
    const backRemove = RN.BackHandler.addEventListener.mock.results[0].value.remove;
    act(() => { tree.unmount(); });
    await settle();
    expect(appStateRemove).toHaveBeenCalled();
    expect(backRemove).toHaveBeenCalled();
    expect(voice.destroy).toHaveBeenCalled();
    expect(voice.removeAllListeners).toHaveBeenCalled();
    expect(onFinish).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });
});

describe('VoiceRecordingOverlay failure paths', () => {
  it('explains a denied microphone permission and cancels', async () => {
    audio.AudioModule.requestRecordingPermissionsAsync.mockImplementationOnce(() => Promise.resolve({ granted: false }));
    const onCancel = jest.fn();
    await mountOverlay({ onCancel });
    expect(mockXAlert).toHaveBeenCalledWith('权限不足', '需要麦克风权限才能录音');
    expect(recorder.record).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });

  it('reports a failed recording start and cancels', async () => {
    recorder.prepareToRecordAsync.mockImplementationOnce(() => Promise.reject(new Error('mic busy')));
    const onCancel = jest.fn();
    await mountOverlay({ onCancel });
    expect(mockXAlert).toHaveBeenCalledWith('录音失败', 'mic busy');
    expect(onCancel).toHaveBeenCalled();
  });

  it('reports a missing error message from a failed start', async () => {
    recorder.prepareToRecordAsync.mockImplementationOnce(() => Promise.reject({}));
    await mountOverlay({});
    expect(mockXAlert).toHaveBeenCalledWith('录音失败', '无法启动录音');
  });

  it('reports a failed save on finish and cancels', async () => {
    recorder.stop.mockImplementationOnce(() => Promise.reject(new Error('disk full')));
    const onFinish = jest.fn();
    const onCancel = jest.fn();
    await mountOverlay({ onFinish, onCancel });
    await press('结束录音');
    await settle();
    expect(mockXAlert).toHaveBeenCalledWith('录音失败', '无法保存录音，请重试');
    expect(onFinish).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });

  it('finishes without a prepared recorder when startup never got that far', async () => {
    const onCancel = jest.fn();
    audio.AudioModule.requestRecordingPermissionsAsync.mockImplementationOnce(() => new Promise(() => {}));
    await mountOverlay({ onCancel, stopAction: 'cancel' });
    await press('取消录音');
    await settle(2);
    expect(recorder.stop).not.toHaveBeenCalled();
  });
});

describe('VoiceRecordingOverlay voice bridge events', () => {
  it('ignores speech events that arrive before recording starts', async () => {
    recorder.prepareToRecordAsync.mockImplementationOnce(() => new Promise(() => {}));
    await mountOverlay({});
    await act(async () => { voice.onSpeechResults!({ value: ['提前'] }); });
    expect(hasText('提前')).toBe(false);
  });

  it('downgrades to audio-only when speech recognition cannot start', async () => {
    voice.start.mockImplementationOnce(() => Promise.reject(new Error('stt unavailable')));
    await mountOverlay({});
    await settle();
    expect(hasText('正在录制音频')).toBe(true);
  });

  it('warns only for unexpected speech errors', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await mountOverlay({});
    voice.onSpeechError!({ error: { code: '5' } });
    voice.onSpeechError!({ error: { code: '11' } });
    expect(warn).not.toHaveBeenCalled();
    voice.onSpeechError!({ error: { code: '7', message: 'nope' } });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('VoiceRecordingOverlay rendering', () => {
  it('renders nothing while hidden and skips the startup pipeline', async () => {
    await act(async () => { tree = create(<VoiceRecordingOverlay visible={false} onFinish={jest.fn()} onCancel={jest.fn()} />); });
    await settle();
    expect(tree.root.findAllByType('Text')).toHaveLength(0);
    expect(audio.AudioModule.requestRecordingPermissionsAsync).not.toHaveBeenCalled();
  });

  it('formats the timer and shows tap-mode hints and buttons', async () => {
    recorderState.durationMillis = 65000;
    recorderState.isRecording = true;
    await mountOverlay({});
    expect(hasText('1:05')).toBe(true);
    expect(hasText('点击下方按钮结束录音')).toBe(true);
    expect(tappable('结束录音')).toBeDefined();
    expect(tappable('取消录音')).toBeDefined();
  });

  it('shows the preparing hint before recording actually starts', async () => {
    recorder.prepareToRecordAsync.mockImplementationOnce(() => new Promise(() => {}));
    await mountOverlay({});
    expect(hasText('正在准备...')).toBe(true);
  });

  it('adapts hold-mode hints and hides the buttons', async () => {
    recorderState.isRecording = true;
    await mountOverlay({ holdMode: true });
    expect(hasText('松手结束，上滑取消')).toBe(true);
    expect(tappable('结束录音')).toBeUndefined();
    expect(tappable('取消录音')).toBeUndefined();
  });

  it('shows the release-to-cancel hint while sliding in hold mode', async () => {
    recorderState.isRecording = true;
    await mountOverlay({ holdMode: true, cancelHint: true });
    expect(hasText('松手取消录音')).toBe(true);
  });

  it('shows the hold-mode preparing hint and the speech placeholder', async () => {
    recorder.prepareToRecordAsync.mockImplementationOnce(() => new Promise(() => {}));
    await mountOverlay({ holdMode: true });
    expect(hasText('正在准备，请继续按住')).toBe(true);
    expect(hasText('语音识别中...')).toBe(true);
  });

  it('keeps the transcript visible with a partial marker while recognizing', async () => {
    await mountOverlay({});
    await act(async () => { voice.onSpeechPartialResults!({ value: ['识别中片段'] }); });
    expect(hasText('识别中片段')).toBe(true);
    expect(hasText('识别中...')).toBe(true);
    await act(async () => { voice.onSpeechResults!({ value: ['最终结果'] }); });
    expect(hasText('最终结果')).toBe(true);
    expect(hasText('识别中...')).toBe(false);
  });
});
