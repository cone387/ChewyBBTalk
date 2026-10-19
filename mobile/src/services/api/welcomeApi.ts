import { apiClient } from './apiClient';

export interface WelcomeQuote { id: string; text: string; source: string; }
export interface WelcomeConfig { enabled: boolean; quotes: WelcomeQuote[]; revision: number; }
const path = '/api/v1/bbtalk/settings/welcome';
export const welcomeApi = {
  get: () => apiClient.get<WelcomeConfig>(path),
  save: (config: WelcomeConfig) => apiClient.patch<WelcomeConfig>(path, config),
  next: () => apiClient.post<{ quote: WelcomeQuote | null }>(path + '/next'),
};
