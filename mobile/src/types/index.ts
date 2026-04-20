export interface Tag {
  id: string;
  name: string;
  color: string;
  sortOrder?: number;
  bbtalkCount?: number;
}

export interface Attachment {
  uid: string;
  url: string;
  type: string;
  filename?: string;
  originalFilename?: string;
  fileSize?: number;
  mimeType?: string;
}

export interface BBTalk {
  id: string;
  content: string;
  visibility: 'public' | 'private' | 'friends';
  tags: Tag[];
  attachments: Attachment[];
  context?: Record<string, any>;
  isPinned?: boolean;
  commentCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface BBTalkFormData {
  content: string;
  tags: string[];
  attachments: Attachment[];
  visibility: 'public' | 'private' | 'friends';
  context?: Record<string, any>;
}

export interface User {
  id: number;
  username: string;
  email?: string;
  display_name?: string;
  avatar?: string;
  bio?: string;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface StorageSettings {
  id: number;
  name: string;
  storage_type: 'local' | 's3';
  s3_access_key_id: string;
  s3_bucket_name: string;
  s3_region_name: string;
  s3_endpoint_url: string;
  s3_custom_domain: string;
  is_active: boolean;
  has_secret_key: boolean;
  is_s3_configured: boolean;
  create_time: string;
  update_time: string;
}

export interface Comment {
  uid: string;
  user: number;
  userDisplayName: string;
  userAvatar: string;
  userUsername: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}
