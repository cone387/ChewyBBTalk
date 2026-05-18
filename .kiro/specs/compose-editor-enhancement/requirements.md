# Requirements Document

## Introduction

This feature enhances the ChewyBBTalk Desktop Compose window by porting key editing capabilities from the web frontend's BBTalkEditor. The goal is to transform the current minimal textarea into a rich quick-publish experience supporting image/file uploads, drag-and-drop, clipboard paste, visibility toggling, inline tag creation, file previews, and auto-resizing — all within the compact, always-on-top frameless window.

## Glossary

- **Compose_Window**: The frameless, always-on-top BrowserWindow used for quick BBTalk creation on desktop
- **Attachment_API**: The backend REST endpoint at `/api/v1/attachments/files/` that accepts multipart file uploads and returns attachment metadata
- **Upload_Manager**: The renderer-side module responsible for coordinating file uploads, tracking upload state, and managing the uploaded file list
- **Visibility_Toggle**: The toolbar control that cycles the BBTalk visibility between public, private, and friends
- **Tag_Parser**: The logic that detects `#tagname ` patterns in content text and extracts tag names
- **File_Preview**: The UI area below the textarea that displays thumbnails for uploaded images and icons for non-image files
- **Draft_Store**: The electron-store persistence layer that saves compose state (content, visibility) across window sessions
- **Desktop_API**: The `window.desktop` contextBridge API exposing IPC methods to the renderer process

## Requirements

### Requirement 1: File Upload via Attachment Button

**User Story:** As a user, I want to click the attachment button (📎) to select and upload files, so that I can attach images and documents to my BBTalk.

#### Acceptance Criteria

1. WHEN the user clicks the attachment toolbar button, THE Compose_Window SHALL open a native file picker dialog allowing selection of one or more files
2. WHEN files are selected from the file picker, THE Upload_Manager SHALL upload each file to the Attachment_API using a multipart POST request with the user's access token
3. WHILE files are uploading, THE Compose_Window SHALL display a visual uploading indicator and disable the publish button
4. WHEN all file uploads complete successfully, THE File_Preview SHALL display each uploaded file as a thumbnail (for images) or a file icon with filename (for non-image files)
5. IF a file upload fails, THEN THE Compose_Window SHALL display a toast error message with the failure reason and allow the user to retry or continue without that file
6. WHEN the user publishes a BBTalk, THE Compose_Window SHALL include all uploaded file attachment UIDs in the publish request body

### Requirement 2: Drag and Drop File Upload

**User Story:** As a user, I want to drag files from my desktop onto the Compose window to upload them, so that I can quickly attach files without using the file picker.

#### Acceptance Criteria

1. WHEN the user drags files over the Compose_Window, THE Compose_Window SHALL display a visual drop zone indicator (blue border and overlay text)
2. WHEN the user drops files onto the Compose_Window, THE Upload_Manager SHALL upload each dropped file to the Attachment_API
3. WHEN the user drags files away from the Compose_Window without dropping, THE Compose_Window SHALL remove the drop zone indicator
4. WHEN image files are dropped, THE Upload_Manager SHALL set the media_type parameter to "image" in the upload request
5. IF non-file items are dragged over the Compose_Window (such as text), THEN THE Compose_Window SHALL not display the drop zone indicator

### Requirement 3: Clipboard Image Paste Upload

**User Story:** As a user, I want to paste images from my clipboard (Ctrl+V) into the editor, so that I can quickly attach screenshots without saving them to disk first.

#### Acceptance Criteria

1. WHEN the user pastes content containing image data into the textarea, THE Upload_Manager SHALL extract the image from the clipboard and upload it to the Attachment_API
2. WHEN clipboard image paste is detected, THE Compose_Window SHALL prevent the default paste behavior for the image data
3. WHEN a clipboard image upload begins, THE Compose_Window SHALL display a toast notification indicating the upload is in progress
4. WHEN the clipboard contains only text (no image data), THE Compose_Window SHALL allow the default paste behavior to insert text normally

### Requirement 4: Visibility Toggle

**User Story:** As a user, I want to toggle the visibility of my BBTalk between public, private, and friends, so that I can control who sees my posts.

#### Acceptance Criteria

1. WHEN the user clicks the visibility toolbar button (🔒), THE Visibility_Toggle SHALL cycle the visibility setting through the sequence: private → public → friends → private
2. THE Compose_Window SHALL display a visual indicator showing the current visibility state (lock icon for private, globe icon for public, people icon for friends)
3. WHEN the visibility setting changes, THE Draft_Store SHALL persist the new visibility value to electron-store
4. WHEN the Compose_Window opens, THE Visibility_Toggle SHALL restore the previously saved visibility value from the Draft_Store
5. WHEN the user publishes a BBTalk, THE Compose_Window SHALL include the current visibility value in the publish request body

### Requirement 5: Inline Tag Input

**User Story:** As a user, I want to type `#tagname ` in my content to create tags, so that I can categorize my BBTalk without a separate tag input UI.

#### Acceptance Criteria

1. WHEN the user types a `#` character followed by non-whitespace characters and then a space, THE Tag_Parser SHALL extract the text between `#` and the space as a tag name
2. THE Tag_Parser SHALL recognize multiple `#tagname ` patterns within the same content and extract all unique tag names
3. WHEN tags are detected in the content, THE Compose_Window SHALL display the recognized tags as visual pills below the toolbar
4. WHEN the user publishes a BBTalk, THE Compose_Window SHALL include the extracted tag names in the publish request body and remove the `#tagname ` markers from the published content
5. WHEN the user deletes a `#tagname ` pattern from the content, THE Tag_Parser SHALL remove that tag from the recognized tag list

### Requirement 6: Uploaded File Preview

**User Story:** As a user, I want to see previews of my uploaded files before publishing, so that I can verify the correct files are attached and remove any I don't want.

#### Acceptance Criteria

1. WHEN an image file is uploaded, THE File_Preview SHALL display a thumbnail of the image with constrained dimensions (max 80px height)
2. WHEN a non-image file is uploaded, THE File_Preview SHALL display a file icon with the filename
3. WHEN the user clicks the remove button on a file preview, THE Upload_Manager SHALL remove that file from the attachment list
4. THE File_Preview SHALL appear between the textarea and the toolbar, scrolling horizontally if files exceed the available width
5. WHEN all files are removed, THE File_Preview area SHALL be hidden to reclaim vertical space

### Requirement 7: Auto-Resize Textarea

**User Story:** As a user, I want the textarea to grow as I type more content, so that I can see all my text without manually scrolling in a tiny fixed-height box.

#### Acceptance Criteria

1. WHEN the content in the textarea changes, THE Compose_Window SHALL adjust the textarea height to fit the content without showing a scrollbar
2. THE Compose_Window SHALL enforce a maximum textarea height of 300px, after which the textarea SHALL display a scrollbar
3. WHEN the textarea height changes, THE Compose_Window SHALL resize the BrowserWindow height accordingly to accommodate the content, file previews, and toolbar
4. THE Compose_Window SHALL enforce a minimum window height of 160px and a maximum window height of 500px
5. WHEN content is deleted and the textarea shrinks, THE Compose_Window SHALL reduce the window height back toward the minimum

### Requirement 8: Window Resize for Attachments

**User Story:** As a user, I want the Compose window to expand when I add file attachments, so that I can see both my text and file previews without the window feeling cramped.

#### Acceptance Criteria

1. WHEN files are uploaded and the File_Preview becomes visible, THE Compose_Window SHALL increase the BrowserWindow height to accommodate the preview area
2. WHEN all files are removed and the File_Preview is hidden, THE Compose_Window SHALL decrease the BrowserWindow height back to the content-appropriate size
3. THE Compose_Window SHALL animate height changes smoothly rather than jumping abruptly
4. THE Compose_Window SHALL persist the last window size to the Draft_Store for reference but always recalculate size based on current content on open

### Requirement 9: Publish with Attachments and Tags

**User Story:** As a user, I want my published BBTalk to include all my attachments, tags, and visibility settings, so that the quick-publish experience matches the web editor's output.

#### Acceptance Criteria

1. WHEN the user publishes a BBTalk with attachments, THE Compose_Window SHALL send the attachment UIDs as an array in the `attachments` field of the POST request to `/api/v1/bbtalk/`
2. WHEN the user publishes a BBTalk with tags, THE Compose_Window SHALL send the tag names as an array in the `tags` field of the POST request
3. WHEN the user publishes a BBTalk, THE Compose_Window SHALL include a `context` field with `source.client` set to "Desktop" and `source.platform` set to the current OS platform
4. WHEN publish succeeds, THE Compose_Window SHALL clear all state: content, uploaded files, and recognized tags
5. WHEN publish succeeds, THE Draft_Store SHALL clear the persisted draft content

