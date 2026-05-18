# Implementation Plan: Compose Editor Enhancement

## Overview

Transform the desktop Compose window from a minimal textarea into a rich quick-publish editor with file uploads, drag-drop, clipboard paste, visibility toggling, inline tag parsing, file previews, and dynamic window resizing. Implementation follows an incremental approach: pure modules first (TagParser, ResizeController), then IPC/preload extensions, then UploadManager, then UI integration and CSS.

## Tasks

- [x] 1. Implement TagParser module
  - [x] 1.1 Create `src/renderer/compose/tagParser.ts` with `parseTags`, `cleanContent`, and `parseAndClean` functions
    - Implement regex-based tag extraction: `#` preceded by start-of-string or whitespace, followed by non-whitespace chars, terminated by a space
    - Return unique tag names array
    - `cleanContent` removes all `#tagname ` markers while preserving other text
    - `parseAndClean` returns `{ tags, cleanedContent }` in one pass
    - _Requirements: 5.1, 5.2, 5.4, 5.5_

  - [ ]* 1.2 Write property tests for TagParser
    - **Property 1: Tag parsing extracts all embedded tags**
    - **Property 3: Content cleaning removes all tag markers**
    - **Validates: Requirements 5.1, 5.2, 5.4, 5.5**
    - Use `fast-check` to generate random strings with embedded `#tag ` patterns
    - Verify extraction produces exactly the set of unique embedded tags
    - Verify cleaned content contains no `#tagname ` markers but preserves all other text

- [x] 2. Implement ResizeController module
  - [x] 2.1 Create `src/renderer/compose/resizeController.ts` with `calculateWindowHeight` function and constants
    - Export `MIN_WINDOW_HEIGHT = 160`, `MAX_WINDOW_HEIGHT = 500`, `MAX_TEXTAREA_HEIGHT = 300`, `TITLEBAR_HEIGHT = 32`, `TOOLBAR_HEIGHT = 38`, `FILE_PREVIEW_HEIGHT = 96`
    - `calculateWindowHeight(dimensions: ResizeDimensions)` sums titlebar + textarea + file preview + tag bar + toolbar, clamped to [160, 500]
    - _Requirements: 7.3, 7.4, 8.1, 8.2_

  - [ ]* 2.2 Write property test for ResizeController
    - **Property 6: Window height clamping invariant**
    - **Validates: Requirements 7.3, 7.4**
    - Use `fast-check` to generate arbitrary textarea heights, file preview visibility, and tag bar visibility
    - Verify output is always between MIN_WINDOW_HEIGHT and MAX_WINDOW_HEIGHT inclusive

- [x] 3. Implement visibility cycle helper
  - [x] 3.1 Create `src/renderer/compose/visibilityCycle.ts` with `nextVisibility` function
    - Implement cycle: `private → public → friends → private`
    - Pure function taking current visibility and returning next
    - _Requirements: 4.1, 4.2_

  - [ ]* 3.2 Write property test for visibility cycle
    - **Property 4: Visibility cycles correctly**
    - **Validates: Requirements 4.1, 4.2**
    - Use `fast-check` to generate random starting states from {private, public, friends}
    - Verify cycling 3 times returns to original state

- [x] 4. Checkpoint - Ensure all pure module tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Add new IPC channels and preload API extensions
  - [x] 5.1 Extend `src/shared/ipc-types.ts` ComposeApi interface
    - Add `resize(width: number, height: number): Promise<void>`
    - Add `getVisibility(): Promise<'public' | 'private' | 'friends'>`
    - Add `setVisibility(visibility: 'public' | 'private' | 'friends'): Promise<void>`
    - Add `openFileDialog(): Promise<string[]>`
    - _Requirements: 4.3, 4.4, 7.3, 8.1, 1.1_

  - [x] 5.2 Register new IPC handlers in `src/main/ipc/composeIpc.ts`
    - `compose:resize` — calls `resizeComposeWindow(width, height)` on the compose BrowserWindow
    - `compose:get-visibility` — reads `compose.visibility` from electron-store
    - `compose:set-visibility` — writes visibility to electron-store
    - `compose:open-file-dialog` — opens native file dialog via `dialog.showOpenDialog` with multiSelections, returns file paths
    - _Requirements: 1.1, 4.3, 4.4, 7.3, 8.1_

  - [x] 5.3 Add window resize logic in `src/main/windows/composeWindow.ts`
    - Export `resizeComposeWindow(width: number, height: number)` function
    - Use `BrowserWindow.setSize()` with `animate: true` on macOS
    - On Windows/Linux, use interval-based stepping over ~150ms for smooth animation
    - _Requirements: 7.3, 8.3_

  - [x] 5.4 Extend preload `src/preload/index.ts` with new compose methods
    - Add `resize`, `getVisibility`, `setVisibility`, `openFileDialog` to the compose section
    - Each method invokes the corresponding IPC channel
    - _Requirements: 4.3, 4.4, 7.3, 8.1, 1.1_

- [x] 6. Implement UploadManager module
  - [x] 6.1 Create `src/renderer/compose/uploadManager.ts`
    - Define `UploadedFile` interface: `{ uid, url, type, name, mimeType?, fileSize? }`
    - Define `UploadState` interface: `{ files, isUploading, error }`
    - Implement `uploadFiles(files: File[], mediaType?)` — constructs FormData, POSTs to `{apiUrl}/api/v1/attachments/files/` with Bearer token
    - Classify files: MIME starts with `image/` → `media_type: 'image'`, otherwise `'auto'`
    - Implement `removeFile(uid)`, `getState()`, `clear()`
    - _Requirements: 1.2, 1.4, 2.2, 2.4, 3.1, 6.3_

  - [ ]* 6.2 Write property tests for UploadManager helpers
    - **Property 7: File type classification**
    - **Property 8: File removal produces correct list**
    - **Validates: Requirements 2.4, 1.4, 6.3**
    - Use `fast-check` to generate random MIME types and verify classification
    - Use `fast-check` to generate random file lists and removal targets, verify list integrity

  - [ ]* 6.3 Write unit tests for UploadManager
    - Mock `fetch` to verify FormData construction and Authorization header
    - Test error handling (network failure, 413, 401)
    - Test `removeFile` and `clear` state transitions
    - _Requirements: 1.2, 1.5, 2.2_

- [x] 7. Checkpoint - Ensure all module tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Refactor ComposeWindow component with new state and UI
  - [x] 8.1 Add component state for uploads, visibility, tags, drag-over, and toast
    - Extend state: `uploadedFiles`, `isUploading`, `visibility`, `tags`, `isDragOver`, update `toast` to include `'info'` kind
    - Load visibility from store on mount via `window.desktop.compose.getVisibility()`
    - _Requirements: 4.4, 6.1, 6.2_

  - [x] 8.2 Implement visibility toggle button in toolbar
    - Replace static 🔒 button with dynamic icon: 🔒 (private), 🌐 (public), 👥 (friends)
    - On click, call `nextVisibility()` and persist via `window.desktop.compose.setVisibility()`
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 8.3 Implement tag parsing integration
    - On content change, call `parseTags(content)` and update `tags` state
    - Display recognized tags as visual pills below the toolbar (or above textarea)
    - _Requirements: 5.1, 5.2, 5.3, 5.5_

  - [x] 8.4 Implement attachment button with file picker
    - On 📎 click, call `window.desktop.compose.openFileDialog()` to get file paths
    - Convert paths to File objects and call `uploadManager.uploadFiles()`
    - Disable publish button while uploading, show uploading indicator
    - _Requirements: 1.1, 1.2, 1.3_

  - [x] 8.5 Implement drag-and-drop file upload
    - Add `onDragEnter`, `onDragOver`, `onDragLeave`, `onDrop` handlers to compose root
    - Show drop zone overlay on drag (blue border + overlay text)
    - On drop, extract files and upload via UploadManager
    - Ignore non-file drag data (text drags)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 8.6 Implement clipboard image paste upload
    - On paste event, check `clipboardData.items` for image types
    - If image found, prevent default, extract as File, upload via UploadManager
    - Show toast "正在上传剪贴板图片…" during upload
    - Allow normal text paste when no image data present
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 8.7 Implement file preview area
    - Render uploaded files between textarea and toolbar
    - Images: show thumbnail (max 80px height)
    - Non-images: show file icon + filename
    - Add remove button (×) on each preview item
    - Horizontal scroll if files exceed width
    - Hide area when no files uploaded
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 8.8 Implement auto-resize textarea and window resize
    - On content change, measure textarea `scrollHeight`
    - Cap textarea at MAX_TEXTAREA_HEIGHT (300px), show scrollbar beyond that
    - Call `calculateWindowHeight()` with current dimensions
    - Send resize via `window.desktop.compose.resize(440, targetHeight)`
    - Shrink window when content is deleted
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 8.1, 8.2_

  - [x] 8.9 Update publish flow to include attachments, tags, visibility, and context
    - Use `parseAndClean(content)` to get cleaned content and tags
    - Build payload: `{ content, tags, attachments: [{uid}...], visibility, context: { source: { client: 'Desktop', platform } } }`
    - On success, clear all state (content, files, tags)
    - Clear draft from store
    - _Requirements: 1.6, 4.5, 5.4, 9.1, 9.2, 9.3, 9.4, 9.5_

  - [ ]* 8.10 Write property test for publish payload construction
    - **Property 2: Publish payload includes all state**
    - **Property 9: Post-publish state reset**
    - **Validates: Requirements 1.6, 4.5, 9.1, 9.2, 9.4**
    - Use `fast-check` to generate random compose states
    - Verify payload contains cleaned content, all tags, all attachment UIDs, and visibility

- [x] 9. Add CSS for new UI elements
  - [x] 9.1 Add drag-drop overlay styles to `compose.css`
    - `.drag-overlay` — absolute positioned, blue border, semi-transparent background, overlay text
    - Show/hide based on `isDragOver` state
    - _Requirements: 2.1, 2.3_

  - [x] 9.2 Add file preview styles
    - `.file-preview-area` — horizontal flex, overflow-x auto, max-height 96px, gap between items
    - `.file-preview-item` — thumbnail container with remove button
    - `.file-preview-img` — max-height 80px, border-radius
    - `.file-preview-file` — icon + filename layout for non-images
    - _Requirements: 6.1, 6.2, 6.4, 6.5_

  - [x] 9.3 Add tag pills styles
    - `.tag-pills` — flex wrap container below toolbar or above textarea
    - `.tag-pill` — small rounded pill with tag name, subtle background
    - _Requirements: 5.3_

  - [x] 9.4 Add visibility indicator styles
    - `.visibility-btn` — styled tool button showing current state icon
    - Tooltip or label showing current visibility name
    - _Requirements: 4.2_

  - [x] 9.5 Add uploading indicator and toast info styles
    - `.uploading-indicator` — spinner or progress bar in toolbar area
    - `.toast.info` — blue/neutral background for info toasts
    - _Requirements: 1.3, 3.3_

- [x] 10. Update window creation to support resizable behavior
  - [x] 10.1 Modify `composeWindow.ts` to allow resizing
    - Change `resizable: false` to `resizable: true` (or keep false but allow programmatic resize)
    - Set `minHeight: 160`, `maxHeight: 500` constraints
    - Persist `lastSize` to store on window close for reference
    - _Requirements: 7.4, 8.4_

- [ ]* 11. Write integration tests
  - [ ]* 11.1 Write integration test for full compose flow
    - Type content → add tags → upload file → set visibility → publish → verify API call body
    - _Requirements: 9.1, 9.2, 9.3_

  - [ ]* 11.2 Write integration test for draft persistence
    - Type content → set visibility → close → reopen → verify content and visibility restored
    - _Requirements: 4.3, 4.4, 9.5_

  - [ ]* 11.3 Write property test for visibility persistence round-trip
    - **Property 5: Visibility persistence round-trip**
    - **Validates: Requirements 4.3, 4.4**
    - Mock electron-store, verify set then get returns same value

- [x] 12. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- Pure modules (TagParser, ResizeController, visibilityCycle) are implemented first for easy testing before wiring into UI
- The project already has `vitest` and `fast-check` configured as devDependencies
