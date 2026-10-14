import { createContext, useContext } from 'react';
import type { UsePrivacyModeReturn } from './usePrivacyMode';

// Consumers can read the shared controller without loading native authentication.
export const PrivacyContext = createContext<UsePrivacyModeReturn | null>(null);
export const usePrivacyController = () => useContext(PrivacyContext);
