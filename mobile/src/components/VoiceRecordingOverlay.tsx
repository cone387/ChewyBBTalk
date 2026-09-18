import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Animated, TouchableOpacity, AppState, BackHandler,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  useAudioRecorder,
  RecordingPresets,
  AudioModule,
  setAudioModeAsync,
  useAudioRecorderState,
} from 'expo-audio';
import { useTheme } from '../theme/ThemeContext';
import { xAlert } from '../utils/crossAlert';

// Lazy-load Voice to avoid crash in Expo Go
let Voice: any = null;
let voiceAvailable = false;
try {
  Voice = require('@react-native-voice/voice').default;
  voiceAvailable = true;
} catch {
  voiceAvailable = false;
}

interface Props {
  visible: boolean;
  holdMode?: boolean;
  cancelHint?: boolean;
  stopAction?: 'finish' | 'cancel';
  onFinish: (result: { text: string; audioUri: string | null; audioDuration: number }) => void;
  onCancel: () => void;
}

export default function VoiceRecordingOverlay({ visible, holdMode = false, cancelHint = false, stopAction, onFinish, onCancel }: Props) {
  const { theme } = useTheme();
  const c = theme.colors;
  const [transcript, setTranscript] = useState('');
  const [partialResult, setPartialResult] = useState('');
  const [sttAvailable, setSttAvailable] = useState(voiceAvailable);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const transcriptRef = useRef('');
  const isRecordingRef = useRef(false);
  const stopRef = useRef<(action: 'finish' | 'cancel') => void>(() => {});
  const callbacks = useRef({ onFinish, onCancel });
  callbacks.current = { onFinish, onCancel };

  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);

  // Setup Voice event handlers
  useEffect(() => {
    if (!Voice) return;
    Voice.onSpeechResults = (e: any) => {
      if (!isRecordingRef.current) return;
      const text = e.value?.[0] || '';
      transcriptRef.current = text;
      setTranscript(text);
      setPartialResult('');
    };
    Voice.onSpeechPartialResults = (e: any) => {
      if (!isRecordingRef.current) return;
      transcriptRef.current = e.value?.[0] || '';
      setPartialResult(e.value?.[0] || '');
    };
    Voice.onSpeechError = (e: any) => {
      if (e.error?.code !== '5' && e.error?.code !== '11') {
        console.warn('Speech error:', e.error);
      }
    };
    return () => { Voice.destroy().then(Voice.removeAllListeners).catch(() => {}); };
  }, []);

  // Pulse animation
  useEffect(() => {
    if (!visible) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.3, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let disposed = false;
    let requested = stopAction;
    let prepared = false;
    let started = false;
    let settling = false;
    let modeChanged = false;
    setTranscript(''); setPartialResult(''); transcriptRef.current = '';
    const startup = (async () => {
      try {
        const status = await AudioModule.requestRecordingPermissionsAsync();
        if (disposed || requested) return;
        if (!status.granted) {
          xAlert('权限不足', '需要麦克风权限才能录音');
          requested = 'cancel'; return;
        }
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        modeChanged = true;
        if (disposed || requested) return;
        await audioRecorder.prepareToRecordAsync();
        prepared = true;
        if (disposed || requested) return;
        audioRecorder.record(); started = true; isRecordingRef.current = true;
        // Do not make release wait on the native speech bridge.
        if (Voice && sttAvailable) {
          Voice.start('zh-CN').then(() => {
            if (disposed || requested) Voice.stop().catch(() => {});
          }).catch(() => { if (!disposed) setSttAvailable(false); });
        }
      } catch (e: any) {
        if (!disposed && !requested) xAlert('录音失败', e.message || '无法启动录音');
        requested = 'cancel';
      }
    })();
    const finish = async () => {
      if (settling) return;
      settling = true;
      await startup;
      let duration = 0;
      let audioUri: string | null = null;
      try {
        if (started) duration = audioRecorder.getStatus().durationMillis;
        if (prepared) await audioRecorder.stop();
        if (started) audioUri = audioRecorder.uri;
      } catch {
        if (!disposed && requested === 'finish') xAlert('录音失败', '无法保存录音，请重试');
        requested = 'cancel';
      }
      isRecordingRef.current = false;
      if (Voice && sttAvailable) Voice.stop().catch(() => {});
      if (modeChanged) await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
      if (disposed) return;
      if (requested === 'finish' && started && duration >= 500 && audioUri) {
        callbacks.current.onFinish({ text: transcriptRef.current, audioUri, audioDuration: Math.max(1, Math.round(duration / 1000)) });
      } else {
        if (requested === 'finish' && started && duration < 500) xAlert('录音太短', '请按住说话后再松手');
        callbacks.current.onCancel();
      }
    };
    stopRef.current = action => { requested = action; void finish(); };
    void startup.then(() => { if (requested || disposed) void finish(); });
    const appState = AppState.addEventListener('change', state => {
      if (state !== 'active') stopRef.current('cancel');
    });
    const back = BackHandler.addEventListener('hardwareBackPress', () => { stopRef.current('cancel'); return true; });
    return () => {
      disposed = true; requested = 'cancel'; void finish();
      appState.remove(); back.remove();
    };
  }, [visible]);

  useEffect(() => {
    if (visible && stopAction) stopRef.current(stopAction);
  }, [visible, stopAction]);

  if (!visible) return null;

  const displayText = transcript || partialResult;
  const secs = Math.round(recorderState.durationMillis / 1000);
  const mins = Math.floor(secs / 60);
  const secsPart = secs % 60;

  return (
    <View style={styles.overlay} pointerEvents={holdMode ? 'none' : 'auto'}>
      <View style={[styles.card, { backgroundColor: c.cardBg }]}>
        <Animated.View style={[styles.micCircle, { backgroundColor: c.danger + '20', transform: [{ scale: pulseAnim }] }]}>
          <View style={[styles.micInner, { backgroundColor: c.danger }]}>
            <Ionicons name="mic" size={32} color="#fff" />
          </View>
        </Animated.View>

        <Text style={[styles.timer, { color: c.text }]}>
          {mins}:{secsPart.toString().padStart(2, '0')}
        </Text>

        <Text style={[styles.hint, { color: c.textTertiary }]}>
          {holdMode ? (cancelHint ? '松手取消录音' : recorderState.isRecording ? '松手结束，上滑取消' : '正在准备，请继续按住') : recorderState.isRecording ? '点击下方按钮结束录音' : '正在准备...'}
        </Text>

        {displayText ? (
          <View style={[styles.transcriptBox, { backgroundColor: c.borderLight }]}>
            <Text style={[styles.transcriptText, { color: c.text }]}>{displayText}</Text>
            {partialResult && !transcript ? (
              <Text style={[styles.transcriptHint, { color: c.textTertiary }]}>识别中...</Text>
            ) : null}
          </View>
        ) : sttAvailable ? (
          <Text style={[styles.transcriptPlaceholder, { color: c.textTertiary }]}>语音识别中...</Text>
        ) : (
          <Text style={[styles.transcriptPlaceholder, { color: c.textTertiary }]}>正在录制音频</Text>
        )}

        {!holdMode && <View style={styles.actionRow}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="取消录音" style={[styles.cancelBtn, { backgroundColor: c.borderLight }]} onPress={() => stopRef.current('cancel')}>
            <Ionicons name="close" size={22} color={c.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="结束录音" style={[styles.stopBtn, { backgroundColor: c.primary }]} onPress={() => stopRef.current('finish')}>
            <Ionicons name="checkmark" size={28} color="#fff" />
          </TouchableOpacity>
        </View>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center',
    zIndex: 300,
  },
  card: {
    width: '80%', borderRadius: 20, padding: 28,
    alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15, shadowRadius: 20, elevation: 10,
  },
  micCircle: {
    width: 80, height: 80, borderRadius: 40,
    justifyContent: 'center', alignItems: 'center',
  },
  micInner: {
    width: 56, height: 56, borderRadius: 28,
    justifyContent: 'center', alignItems: 'center',
  },
  timer: { fontSize: 28, fontWeight: '700', marginTop: 16 },
  hint: { fontSize: 13, marginTop: 6 },
  transcriptBox: {
    marginTop: 16, padding: 12, borderRadius: 12,
    width: '100%', minHeight: 50,
  },
  transcriptText: { fontSize: 15, lineHeight: 22 },
  transcriptHint: { fontSize: 11, marginTop: 4 },
  transcriptPlaceholder: { fontSize: 13, marginTop: 16 },
  actionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 20, marginTop: 24,
  },
  cancelBtn: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center',
  },
  stopBtn: {
    width: 56, height: 56, borderRadius: 28,
    justifyContent: 'center', alignItems: 'center',
  },
});
