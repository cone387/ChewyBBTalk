import { useEffect, useRef, useState } from 'react';
import { AppState, type GestureResponderEvent, type ViewProps } from 'react-native';

/** Bind handlers to a View: touchables replace/drop the native responder handlers. */
export function useHoldToRecord(onStart: () => boolean | void, busy: boolean, onTap?: () => void) {
  const held = useRef(false);
  const touching = useRef(false);
  const moved = useRef(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const cancel = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef({ onStart, busy, onTap });
  latest.current = { onStart, busy, onTap };
  const [pressed, setPressed] = useState(false);
  const [holdMode, setHoldMode] = useState(false);
  const [cancelHint, setCancelHint] = useState(false);
  const [stopAction, setStopAction] = useState<'finish' | 'cancel'>();

  const clearTimer = () => { clearTimeout(timer.current); timer.current = undefined; };

  const release = (interrupted = false) => {
    if (!touching.current) return;
    touching.current = false;
    clearTimer();
    setPressed(false);
    if (!held.current) {
      if (!interrupted && !moved.current && !latest.current.busy) latest.current.onTap?.();
      return;
    }
    held.current = false;
    setStopAction(interrupted || cancel.current ? 'cancel' : 'finish');
  };
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => {
      if (state !== 'active') release(true);
    });
    return () => { clearTimer(); listener.remove(); };
  }, []);

  return {
    holdMode, cancelHint, stopAction, pressed,
    handlers: {
      accessible: true,
      onStartShouldSetResponder: () => !latest.current.busy,
      onResponderGrant: (event: GestureResponderEvent) => {
        if (latest.current.busy || touching.current) return;
        touching.current = true; moved.current = false;
        setPressed(true);
        startX.current = event.nativeEvent.pageX;
        startY.current = event.nativeEvent.pageY;
        cancel.current = false;
        setCancelHint(false); setStopAction(undefined); setHoldMode(false);
        clearTimer();
        timer.current = setTimeout(() => {
          timer.current = undefined;
          if (!touching.current || latest.current.busy) return;
          // A rejected long press must not fall through to the tap action.
          moved.current = true;
          if (latest.current.onStart() === false) return;
          held.current = true; setHoldMode(true);
        }, 300);
      },
      onResponderMove: (event: GestureResponderEvent) => {
        if (!touching.current) return;
        if (!held.current) {
          if (Math.abs(startY.current - event.nativeEvent.pageY) > 10 ||
              Math.abs(startX.current - event.nativeEvent.pageX) > 10) {
            moved.current = true; clearTimer();
          }
          return;
        }
        cancel.current = startY.current - event.nativeEvent.pageY > 64;
        setCancelHint(cancel.current);
      },
      onResponderRelease: () => release(),
      onResponderTerminate: () => release(true),
      // Once recording, retain ownership when sliding outside the button/over a ScrollView.
      onResponderTerminationRequest: () => !held.current,
      accessibilityHint: '按住录音，松手结束，上滑取消',
      accessibilityActions: [{ name: 'activate' }, { name: 'longpress', label: '开始录音' }],
      onAccessibilityTap: () => { if (!busy) onTap?.(); },
      onAccessibilityAction: event => {
        if (busy) return;
        if (event.nativeEvent.actionName === 'activate') { onTap?.(); return; }
        if (event.nativeEvent.actionName !== 'longpress') return;
        setStopAction(undefined); setHoldMode(false); onStart();
      },
    } satisfies ViewProps,
  };
}
