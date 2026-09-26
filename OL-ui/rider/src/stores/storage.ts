import AsyncStorage from '@react-native-async-storage/async-storage';
import { createJSONStorage } from 'zustand/middleware';

/** Shared AsyncStorage adapter for persisted Zustand stores (no PII is stored here). */
export const zustandStorage = createJSONStorage(() => AsyncStorage);
