import { useRef, useState } from 'react';
import type { GestureResponderEvent } from 'react-native';

/** Keep the original touch as the owner until finger-up, even outside the button. */
export function useHoldToRecord(onStart: () => boolean | void, busy: boolean, onTap?: () => void) {
  const held = useRef(false);
  const longPressed = useRef(false);
  const startY = useRef(0);
  const cancel = useRef(false);
  const [holdMode, setHoldMode] = useState(false);
  const [cancelHint, setCancelHint] = useState(false);
  const [stopAction, setStopAction] = useState<'finish' | 'cancel'>();

  const release = (interrupted = false) => {
    if (!held.current) return;
    held.current = false;
    setStopAction(interrupted || cancel.current ? 'cancel' : 'finish');
  };
  return {
    holdMode, cancelHint, stopAction,
    handlers: {
      delayLongPress: 300,
      onPressIn: (event: GestureResponderEvent) => {
        if (busy) return;
        startY.current = event.nativeEvent.pageY;
        cancel.current = false; longPressed.current = false;
        setCancelHint(false); setStopAction(undefined); setHoldMode(false);
      },
      onLongPress: () => {
        if (busy || onStart() === false) return;
        held.current = true; longPressed.current = true; setHoldMode(true);
      },
      onPress: () => { if (!busy && !longPressed.current) onTap?.(); },
      onTouchMove: (event: GestureResponderEvent) => {
        if (!held.current) return;
        cancel.current = startY.current - event.nativeEvent.pageY > 64;
        setCancelHint(cancel.current);
      },
      onTouchEnd: () => release(),
      onTouchCancel: () => release(true),
      accessibilityHint: '按住录音，松手结束，上滑取消',
      accessibilityActions: [{ name: 'longpress', label: '开始录音' }],
      onAccessibilityAction: () => {
        if (busy) return;
        setStopAction(undefined); setHoldMode(false); onStart();
      },
    },
  };
}
