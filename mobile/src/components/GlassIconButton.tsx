import React, { useState } from 'react';
import { TouchableOpacity, type TouchableOpacityProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Theme } from '../theme/themes';
import GlassSurface from './GlassSurface';

type Props = TouchableOpacityProps & {
  theme: Theme;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  accessibilityLabel: string;
  size?: number;
};

export default function GlassIconButton({ theme, icon, size = 48, style, disabled, onPressIn, onPressOut, ...props }: Props) {
  const [pressed, setPressed] = useState(false);
  return <TouchableOpacity {...props} disabled={disabled} activeOpacity={1} accessibilityRole="button"
    accessibilityState={{ disabled: Boolean(disabled) }} style={[{ minWidth: size, minHeight: size }, style]}
    onPressIn={event => { setPressed(true); onPressIn?.(event); }}
    onPressOut={event => { setPressed(false); onPressOut?.(event); }}>
    <GlassSurface theme={theme} radius={size / 2} style={{ minWidth: size, minHeight: size, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={icon} size={22} color={disabled ? theme.colors.textTertiary : pressed ? theme.colors.primary : theme.colors.text} />
    </GlassSurface>
  </TouchableOpacity>;
}
