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

export interface StorageSettingsUpdate {
  name?: string;
  storage_type?: 'local' | 's3';
  s3_access_key_id?: string;
  s3_secret_access_key?: string;
  s3_bucket_name?: string;
  s3_region_name?: string;
  s3_endpoint_url?: string;
  s3_custom_domain?: string;
  is_active?: boolean;
}

export interface StorageTestResult {
  success: boolean;
  message: string;
}
