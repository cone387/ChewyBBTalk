# Tasks

## Task 1: Create useReducedMotion hook and animation utilities

- [x] 1.1 Create `mobile/src/hooks/useReducedMotion.ts` that reads `AccessibilityInfo.isReduceMotionEnabled()` on mount, subscribes to `reduceMotionChanged` event, and returns a boolean
- [x] 1.2 Create `mobile/src/utils/animationConfig.ts` with a `getAnimationDuration(reducedMotion: boolean): number` helper that returns 0 when reduced motion is true, 250 otherwise
- [x] 1.3 Write property-based test `mobile/__tests__/properties/animationDuration.test.ts` verifying Property 2 (duration is 0 when reduced motion true, 200-300 when false) with fast-check, minimum 100 iterations

## Task 2: Create Error Boundary and Error Serializer

- [x] 2.1 Create `mobile/src/utils/errorSerializer.ts` with `serializeErrorState(state: SerializedErrorState): string` and `deserializeErrorState(json: string): SerializedErrorState` functions
- [x] 2.2 Create `mobile/src/components/ErrorBoundary.tsx` class component with `getDerivedStateFromError`, `componentDidCatch` (calls `logError`), and `resetError` method
- [x] 2.3 Create `mobile/src/components/ErrorFallback.tsx` with "出了点问题" message, retry button (44x44pt minimum), themed colors, and `accessibilityRole="alert"`
- [x] 2.4 Write property-based test `mobile/__tests__/properties/errorSerializer.test.ts` verifying Property 5 (round-trip: deserialize(serialize(x)) === x) with fast-check, minimum 100 iterations
- [~] 2.5 Write property-based test `mobile/__tests__/properties/errorBoundary.test.tsx` verifying Property 3 (boundary catches any Error and renders fallback) with fast-check, minimum 100 iterations
- [x] 2.6 Wrap the root navigation tree in `App.tsx` with the ErrorBoundary component (outermost wrapper)

## Task 3: Create Contrast Validator and Fix Theme Colors

- [~] 3.1 Create `mobile/src/utils/contrastValidator.ts` with `hexToLuminance`, `getContrastRatio`, and `validateThemeContrast` pure functions implementing WCAG relative luminance formula
- [~] 3.2 Write property-based test `mobile/__tests__/properties/themeContrast.test.ts` verifying Property 4 (all theme color pairs meet WCAG AA ratios) with fast-check, minimum 100 iterations
- [~] 3.3 Run contrast validation against all 5 themes and fix any failing color values in `ThemeContext.tsx` (adjust textTertiary, textSecondary, or primary as needed while preserving visual identity)

## Task 4: Add Accessibility Labels and Roles to Components

- [~] 4.1 Add `accessibilityRole="button"` and `accessibilityLabel` (containing content summary) to `BBTalkCard.tsx` tappable container
- [~] 4.2 Add `accessibilityLabel` and `accessibilityRole` to icon-only buttons in `BatchToolbar.tsx`, `SearchBar.tsx`, and footer action buttons
- [~] 4.3 Add `accessibilityLabel` to text inputs in `SearchBar.tsx` ("搜索碎碎念") and `CommentInputModal.tsx` ("输入评论")
- [~] 4.4 Add `accessibilityRole` and `accessibilityLabel` to `TagTabs.tsx` tab items (role="tab") and the compose FAB button in `HomeScreen.tsx`
- [~] 4.5 Write property-based test `mobile/__tests__/properties/cardAccessibility.test.tsx` verifying Property 1 (card has role="button" and label includes content) with fast-check, minimum 100 iterations

## Task 5: Enforce Touch Target Sizing

- [~] 5.1 Audit and fix icon buttons in `BBTalkCard.tsx` footer (like, comment, more) — add `hitSlop` or padding to ensure 44x44pt minimum
- [~] 5.2 Audit and fix `TagTabs.tsx` tab items — ensure each tab has minimum 44pt height and 8pt gap between tabs
- [~] 5.3 Audit and fix `BatchToolbar.tsx` action buttons — ensure 44x44pt minimum and 8pt spacing
- [~] 5.4 Audit and fix `SearchBar.tsx` clear/search icon buttons — add hitSlop for 44x44pt
- [~] 5.5 Audit and fix drawer menu items in `DrawerContent.tsx` — ensure 44pt minimum height per item

## Task 6: iOS Permission Declarations and Privacy URL

- [x] 6.1 Add `NSPhotoLibraryUsageDescription`, `NSLocationWhenInUseUsageDescription`, and `NSCameraUsageDescription` to `app.json` under `expo.ios.infoPlist` with Chinese descriptions
- [x] 6.2 Add `privacyUrl` field under `expo.ios` in `app.json` pointing to `https://bbtalk.cone387.top/privacy/`
- [~] 6.3 Write smoke test `mobile/__tests__/appConfig.test.ts` verifying all required infoPlist keys and privacyUrl exist in app.json

## Task 7: Integrate useReducedMotion into Animated Components

- [~] 7.1 Update `SkeletonCard.tsx` to use `useReducedMotion` — skip pulse animation when reduced motion is enabled
- [~] 7.2 Update `LoadingPlaceholder.tsx` to use `useReducedMotion` — set fade-in duration to 0 when reduced motion is enabled
- [ ] 7.3 Update drawer animation in `App.tsx` (`HomeWithDrawer`) to use reduced motion — use timing with 0 duration instead of spring when reduced motion is enabled
