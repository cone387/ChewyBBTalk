import React from 'react';
import { Platform, View, type ViewProps, type ViewStyle } from 'react-native';
import type { Theme } from '../theme/themes';
import { glassPalette, UI } from '../theme/materials';
import { useGlassPreferences } from '../theme/GlassPreferences';

type Props = ViewProps & { theme: Theme; radius?: number; elevated?: boolean };
const fill: ViewStyle = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 };
let nativeGlass: typeof import('expo-glass-effect') | null | undefined;
function getNativeGlass() {
  if (nativeGlass === undefined) {
    try { nativeGlass = require('expo-glass-effect'); } catch { nativeGlass = null; }
  }
  return nativeGlass;
}
function getSupportedGlass() {
  try {
    const native = getNativeGlass();
    return native?.isLiquidGlassAvailable() && native?.isGlassEffectAPIAvailable() ? native.GlassView : null;
  } catch { return null; }
}

/** A decorative backing only. Controls retain their own semantics and hit targets.
 * Keep this surface and its ancestors at opacity 1 for iOS Liquid Glass.
 * Content cards and privacy shields deliberately use opaque View surfaces instead.
 */
export default function GlassSurface({ theme, radius = UI.radius.sheet, elevated = false, style, children, ...props }: Props) {
  const { ready, reduceTransparency } = useGlassPreferences();
  const palette = glassPalette(theme);
  const canBlur = ready && !reduceTransparency && (Platform?.OS === 'ios' || Platform?.OS === 'web');
  const Glass = canBlur && Platform?.OS === 'ios' ? getSupportedGlass() : null;
  const Blur = canBlur && !Glass ? (require('expo-blur') as typeof import('expo-blur')).BlurView : null;
  return <View {...props} style={[{ borderRadius: radius }, elevated && {
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: palette.shadow, shadowRadius: 18, elevation: 5,
  }, style]}>
    <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={{ ...fill, borderRadius: radius, overflow: 'hidden', backgroundColor: canBlur ? 'transparent' : theme.colors.surface }}>
      {Glass ? <Glass pointerEvents="none" style={{ ...fill, borderRadius: radius }} glassEffectStyle="regular" colorScheme={theme.key === 'dark' ? 'dark' : 'light'} />
        : Blur ? <><Blur pointerEvents="none" style={fill} intensity={65} tint={theme.key === 'dark' ? 'dark' : 'light'} />
          <View style={{ ...fill, backgroundColor: palette.tint }} /></> : null}
      <View style={{ ...fill, borderRadius: radius, borderWidth: 1, borderColor: canBlur ? palette.border : theme.colors.border }} />
    </View>
    {children}
  </View>;
}
