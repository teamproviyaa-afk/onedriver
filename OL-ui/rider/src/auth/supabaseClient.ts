import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { env, hasSupabase } from '@/config/env';

let client: SupabaseClient | null = null;

/**
 * Supabase client using ONLY the publishable key. Auth sessions persist in
 * AsyncStorage (tokens are short-lived and refreshed by supabase-js).
 * No privileged (service-role) operations ever run from the app.
 */
export const getSupabase = (): SupabaseClient | null => {
  if (!hasSupabase) return null;
  if (!client) {
    client = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
};
