export interface Tag {
  id: string;       // uid
  name: string;
  color: string;
  sortOrder?: number;
  bbtalkCount?: number;
}

export interface Attachment {
  uid: string;
  url: string;
  type: string;     // image, video, audio, file
  filename?: string;
  originalFilename?: string;
  fileSize?: number;
  mimeType?: string;
}

export interface BBTalk {
  id: string;       // uid
  content: string;
  visibility: 'public' | 'private' | 'friends';
  tags: Tag[];
  attachments: Attachment[];
  context?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: number;
  username: string;
  email?: string;
  displayName?: string;
  avatar?: string;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
