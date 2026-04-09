import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Animated, Platform, Alert, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { useTheme } from '../theme/ThemeContext';

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
  onFinish: (result: { text: string; audioUri: string | null; audioDuration: number }) => void;
  onCancel: () => void;
}

export default function VoiceRecordingOverlay({ visible, onFinish, onCancel }: Props) {
  const { theme } = useTheme();
  const c = theme.colors;
  const [transcript, setTranscript] = useState('');
  const [partialResult, setPartialResult] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [sttAvailable, setSttAvailable] = useState(voiceAvailable);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const transcriptRef = useRef('');

  // Setup Voice event handlers (only if available)
  useEffect(() => {
    if (!Voice) return;
    Voice.onSpeechResults = (e: any) => {
      const text = e.value?.[0] || '';
      transcriptRef.current = text;
      setTranscript(text);
      setPartialResult('');
    };
    Voice.onSpeechPartialResults = (e: any) => {
      setPartialResult(e.value?.[0] || '');
    };
    Voice.onSpeechError = (e: any) => {
      // code 5 = no speech, code 11 = not available
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
    if (visible) startRecording();
  }, [visible]);

  const startRecording = async () => {
    try {
      setTranscript('');
      setPartialResult('');
      setDuration(0);
      transcriptRef.current = '';

      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        Alert.alert('权限不足', '需要麦克风权限才能录音');
        onCancel();
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();
      recordingRef.current = recording;
      setIsRecording(true);

      const start = Date.now();
      timerRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - start) / 1000));
      }, 200);

      // Start STT if available
      if (Voice && sttAvailable) {
        try {
          await Voice.start('zh-CN');
        } catch {
          setSttAvailable(false);
        }
      }
    } catch (e: any) {
      console.error('Failed to start recording:', e);
      Alert.alert('录音失败', e.message || '无法启动录音');
      onCancel();
    }
  };

  const stopAndFinish = async () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }

    let audioUri: string | null = null;
    try {
      if (recordingRef.current) {
        await recordingRef.current.stopAndUnloadAsync();
        audioUri = recordingRef.current.getURI();
        recordingRef.current = null;
      }
    } catch {}

    if (Voice && sttAvailable) { try { await Voice.stop(); } catch {} }
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

    setIsRecording(false);
    onFinish({ text: transcriptRef.current, audioUri, audioDuration: duration });
  };

  const stopAndCancel = async () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    try { if (recordingRef.current) { await recordingRef.current.stopAndUnloadAsync(); recordingRef.current = null; } } catch {}
    if (Voice && sttAvailable) { try { await Voice.stop(); } catch {} }
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
    setIsRecording(false);
    onCancel();
  };

  if (!visible) return null;

  const displayText = transcript || partialResult;
  const mins = Math.floor(duration / 60);
  const secs = duration % 60;

  return (
    <View style={styles.overlay}>
      <View style={[styles.card, { backgroundColor: c.cardBg }]}>
        <Animated.View style={[styles.micCircle, { backgroundColor: c.danger + '20', transform: [{ scale: pulseAnim }] }]}>
          <View style={[styles.micInner, { backgroundColor: c.danger }]}>
            <Ionicons name="mic" size={32} color="#fff" />
          </View>
        </Animated.View>

        <Text style={[styles.timer, { color: c.text }]}>
          {mins}:{secs.toString().padStart(2, '0')}
        </Text>

        <Text style={[styles.hint, { color: c.textTertiary }]}>
          {isRecording ? '点击下方按钮结束录音' : '正在准备...'}
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
          <Text style={[styles.transcriptPlaceholder, { color: c.textTertiary }]}>仅录音（语音识别需 dev build）</Text>
        )}

        <View style={styles.actionRow}>
          <TouchableOpacity style={[styles.cancelBtn, { backgroundColor: c.borderLight }]} onPress={stopAndCancel}>
            <Ionicons name="close" size={22} color={c.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.stopBtn, { backgroundColor: c.primary }]} onPress={stopAndFinish}>
            <Ionicons name="checkmark" size={28} color="#fff" />
          </TouchableOpacity>
        </View>
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
