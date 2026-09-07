import { apiClient } from './apiClient'

export interface BackupList {
  items: { filename: string; size: number; created_at: string }[]
  latest: { status: 'running' | 'success' | 'failed' | 'interrupted' | 'unknown'; message?: string; started_at?: string; finished_at?: string } | null
}

const endpoint = '/api/v1/bbtalk/data/backups/'
export const backupApi = {
  list: () => apiClient.get<BackupList>(endpoint),
  create: () => apiClient.post<BackupList>(endpoint),
  download: (filename: string) => apiClient.download(`${endpoint}${encodeURIComponent(filename)}/`),
}
