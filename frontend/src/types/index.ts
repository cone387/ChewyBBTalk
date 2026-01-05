export interface Tag {
  id: string;
  name: string;
  color: string;
  sortOrder?: number;
  bbtalkCount?: number;
}

export interface Media {
  id: string;
  url: string;
  mediaType: string;
  originalFilename?: string;
  filename?: string;
  fileSize?: number;
}

export interface BBTalk {
  id: string;
  content: string;
  visibility: 'public' | 'private';
  tags: Tag[];
  media: Media[];
  context?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  isDeleted: boolean;
  deletedAt: string | null;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
