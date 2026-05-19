# Requirements Document

## Introduction

Mobile UI optimization for ChewyBBTalk (碎碎念) to meet Apple App Store submission requirements. This spec covers accessibility compliance, touch target sizing, animation consistency, error resilience, iOS permission declarations, privacy policy configuration, and color contrast verification across all 5 themes. The goal is to pass App Store review on first submission while improving overall UX quality.

## Glossary

- **App**: The ChewyBBTalk mobile application built with Expo SDK 54 + React Native 0.81
- **Interactive_Element**: Any UI element that responds to user touch (buttons, inputs, cards, tabs, links)
- **Touch_Target**: The tappable area of an Interactive_Element, measured in density-independent points (pt)
- **Accessibility_Label**: A text string read by VoiceOver/TalkBack to describe an Interactive_Element's purpose
- **Accessibility_Role**: A semantic role (button, link, header, etc.) that conveys element behavior to assistive technology
- **Error_Boundary**: A React component that catches JavaScript errors in its child component tree and renders a fallback UI
- **WCAG_AA**: Web Content Accessibility Guidelines level AA, requiring minimum 4.5:1 contrast ratio for normal text and 3:1 for large text
- **Theme**: One of 5 color configurations (默认蓝, 深色, 清新绿, 玫瑰红, 活力橙) available in the app
- **Reduced_Motion**: The user's system preference (`prefers-reduced-motion`) indicating animations should be minimized
- **InfoPlist**: The iOS configuration dictionary in app.json that declares permission usage descriptions

## Requirements

### Requirement 1: Accessibility Labels for Interactive Elements

**User Story:** As a visually impaired user, I want all interactive elements to have descriptive labels, so that I can navigate and use the app with VoiceOver.

#### Acceptance Criteria

1. THE App SHALL provide an `accessibilityLabel` on every Interactive_Element that does not contain visible text describing its purpose.
2. THE App SHALL assign an appropriate `accessibilityRole` (button, link, header, search, tab, image, checkbox) to every Interactive_Element.
3. WHEN an Interactive_Element contains only an icon, THE App SHALL provide an `accessibilityLabel` describing the action (e.g., "删除", "设置", "返回").
4. WHEN a card or list item is tappable, THE App SHALL set `accessibilityRole` to "button" and provide a label summarizing the item's content or action.
5. WHEN a text input is present, THE App SHALL associate an `accessibilityLabel` describing the expected input (e.g., "搜索碎碎念", "输入评论").

### Requirement 2: Touch Target Sizing

**User Story:** As a mobile user, I want all tappable elements to be large enough to tap accurately, so that I don't accidentally trigger the wrong action.

#### Acceptance Criteria

1. THE App SHALL render every Interactive_Element with a minimum touch target size of 44x44 points.
2. THE App SHALL maintain a minimum gap of 8 points between adjacent Interactive_Elements.
3. WHEN an icon button has a visual size smaller than 44x44 points, THE App SHALL expand the tappable area using `hitSlop` or padding to meet the 44x44 point minimum.
4. WHEN footer action buttons are arranged in a row, THE App SHALL space them with a minimum of 8 points between their touch target boundaries.

### Requirement 3: Animation Consistency and Reduced Motion

**User Story:** As a user sensitive to motion, I want the app to respect my system preferences and provide consistent, non-jarring animations, so that I can use the app comfortably.

#### Acceptance Criteria

1. THE App SHALL use transition durations between 200ms and 300ms for all UI state changes (opacity, color, transform).
2. WHEN the user has enabled Reduced_Motion in system settings, THE App SHALL disable or reduce all non-essential animations to instant transitions (0ms duration).
3. THE App SHALL provide a `useReducedMotion` hook that reads the system accessibility preference and returns a boolean.
4. WHEN an async operation begins, THE App SHALL display visual feedback (loading indicator or skeleton) within 100ms of the operation starting.

### Requirement 4: React Error Boundary

**User Story:** As a user, I want the app to recover gracefully from unexpected errors, so that I don't see a white screen crash.

#### Acceptance Criteria

1. THE App SHALL wrap the root navigation tree in an Error_Boundary component.
2. WHEN a render error occurs in any child component, THE Error_Boundary SHALL catch the error and display a fallback UI instead of a white screen.
3. THE Error_Boundary fallback UI SHALL display a user-friendly error message in Chinese (e.g., "出了点问题") and a retry button.
4. WHEN the user taps the retry button, THE Error_Boundary SHALL reset its error state and attempt to re-render the child component tree.
5. WHEN an error is caught, THE Error_Boundary SHALL log the error details using the existing `logError` utility for debugging purposes.

### Requirement 5: iOS Permission Descriptions

**User Story:** As an iOS user, I want to understand why the app requests access to my photos and location, so that I can make informed privacy decisions.

#### Acceptance Criteria

1. THE App SHALL declare `NSPhotoLibraryUsageDescription` in the iOS InfoPlist with a Chinese description explaining photo access is used for attaching images to entries.
2. THE App SHALL declare `NSLocationWhenInUseUsageDescription` in the iOS InfoPlist with a Chinese description explaining location access is used for tagging entries with location context.
3. THE App SHALL declare `NSCameraUsageDescription` in the iOS InfoPlist with a Chinese description explaining camera access is used for taking photos to attach to entries.

### Requirement 6: Privacy Policy URL Configuration

**User Story:** As an App Store reviewer, I want the app to declare a privacy policy URL, so that the app meets App Store metadata requirements.

#### Acceptance Criteria

1. THE App SHALL include a `privacyUrl` field under the `expo.ios` section of app.json pointing to the backend privacy policy endpoint.
2. THE App SHALL ensure the privacy policy URL is accessible via HTTPS and returns a valid HTML page.

### Requirement 7: Color Contrast Compliance

**User Story:** As a user with low vision, I want all text to have sufficient contrast against its background, so that I can read content in any theme.

#### Acceptance Criteria

1. FOR ALL 5 Themes, THE App SHALL ensure that `text` color against `background` color meets WCAG_AA contrast ratio of 4.5:1 or higher.
2. FOR ALL 5 Themes, THE App SHALL ensure that `textSecondary` color against `background` and `surface` colors meets WCAG_AA contrast ratio of 4.5:1 or higher.
3. FOR ALL 5 Themes, THE App SHALL ensure that `textTertiary` color against `surface` color meets a minimum contrast ratio of 3:1 (as tertiary text is used for supplementary metadata at smaller sizes).
4. IF a Theme color combination fails to meet the required contrast ratio, THEN THE App SHALL adjust the color value to the nearest compliant value while preserving the theme's visual identity.
5. THE App SHALL ensure that the `primary` color used for interactive text (links, buttons) meets a 3:1 contrast ratio against its background in all Themes.

### Requirement 8: Error Boundary Pretty Printer (Round-Trip)

**User Story:** As a developer, I want error state to be serializable and deserializable, so that error reports can be stored and replayed for debugging.

#### Acceptance Criteria

1. THE Error_Boundary SHALL serialize caught error state (message, componentStack, timestamp) into a JSON string.
2. THE Error_Boundary SHALL deserialize a JSON error state string back into a structured error object.
3. FOR ALL valid error state objects, serializing then deserializing SHALL produce an equivalent object (round-trip property).
