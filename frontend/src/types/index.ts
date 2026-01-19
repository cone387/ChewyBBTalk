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

// 用于发布 BBTalk 的表单数据
export interface BBTalkFormData {
  content: string
  tags: string[]
  attachments: Attachment[]
  visibility: 'public' | 'private' | 'friends'
  context?: Record<string, any>
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
