/**
 * UploadManager — handles file uploads to the BBTalk Attachment API.
 *
 * Uploads happen directly from the renderer via fetch (no main-process proxy).
 * Auth token and API URL are retrieved via window.desktop IPC.
 */

export interface UploadedFile {
  uid: string;
  url: string;
  type: 'image' | 'video' | 'audio' | 'file';
  name: string;
  mimeType?: string;
  fileSize?: number;
}

/**
 * Classify a file's media_type for the upload API.
 * If MIME starts with "image/" → "image", otherwise "auto".
 */
export function classifyMediaType(mimeType: string): 'image' | 'auto' {
  return mimeType.startsWith('image/') ? 'image' : 'auto';
}

/**
 * Remove a file from a list by UID. Returns a new array.
 */
export function removeFileFromList(files: UploadedFile[], uid: string): UploadedFile[] {
  return files.filter((f) => f.uid !== uid);
}

/**
 * Upload a single file to the Attachment API.
 * Returns the uploaded file metadata.
 */
export async function uploadFile(
  file: File,
  apiUrl: string,
  token: string | null,
  mediaType?: 'image' | 'auto',
): Promise<UploadedFile> {
  const formData = new FormData();
  formData.append('file', file, file.name || 'upload');

  const resolvedMediaType = mediaType ?? classifyMediaType(file.type);
  formData.append('media_type', resolvedMediaType);
  formData.append('is_public', 'true');

  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${apiUrl}/api/v1/attachments/files/`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    let message = '上传失败';
    if (response.status === 413) {
      message = '文件太大，请压缩后重试';
    } else if (error.detail) {
      message = error.detail;
    } else if (error.file) {
      message = Array.isArray(error.file) ? error.file.join('; ') : String(error.file);
    }
    throw new Error(message);
  }

  const data = await response.json();

  // Determine file type from response
  let fileType: UploadedFile['type'] = 'file';
  const mime = data.mime_type || '';
  if (data.media_type === 'image' || mime.startsWith('image/')) {
    fileType = 'image';
  } else if (data.media_type === 'video' || mime.startsWith('video/')) {
    fileType = 'video';
  } else if (data.media_type === 'audio' || mime.startsWith('audio/')) {
    fileType = 'audio';
  }

  return {
    uid: data.uid || data.id || '',
    url: data.preview_url || data.url || data.file || '',
    type: fileType,
    name: file.name,
    mimeType: mime,
    fileSize: data.file_size || data.size,
  };
}

/**
 * Upload multiple files. Returns all successfully uploaded files.
 * Throws on first failure (caller should handle).
 */
export async function uploadFiles(
  files: File[],
  apiUrl: string,
  token: string | null,
  mediaType?: 'image' | 'auto',
): Promise<UploadedFile[]> {
  const results = await Promise.all(
    files.map((file) => uploadFile(file, apiUrl, token, mediaType)),
  );
  return results;
}
