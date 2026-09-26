/**
 * Provider registry.
 *
 *   UI → hooks → stores / TanStack Query → repositories → data provider
 *      → LocalDemoProvider | OneLocalApiProvider (+ SupabaseAuthProvider)
 *
 * The provider is chosen once from the environment:
 *   DATA_MODE=local_demo or empty PROVIYAA_API_BASE_URL → LocalDemoProvider + DemoAuthProvider
 *   otherwise                                           → OneLocalApiProvider + SupabaseAuthProvider
 */
import { DemoAuthProvider } from '@/auth/demoAuthProvider';
import { SupabaseAuthProvider } from '@/auth/supabaseAuthProvider';
import { env, hasApiBase, hasSupabase, isLocalDemo } from '@/config/env';
import { LocalDemoProvider } from './localDemoProvider';
import { OneLocalApiProvider } from './oneLocalApiProvider';
import type { AuthProvider, RiderDataProvider } from './types';

let authProvider: AuthProvider | null = null;
let dataProvider: RiderDataProvider | null = null;
let demoProvider: LocalDemoProvider | null = null;

export const getAuthProvider = (): AuthProvider => {
  if (!authProvider) {
    authProvider = isLocalDemo || !hasSupabase ? new DemoAuthProvider() : new SupabaseAuthProvider();
  }
  return authProvider;
};

export const getDataProvider = (): RiderDataProvider => {
  if (!dataProvider) {
    if (isLocalDemo || !hasApiBase) {
      demoProvider = new LocalDemoProvider();
      dataProvider = demoProvider;
    } else {
      dataProvider = new OneLocalApiProvider(env.PROVIYAA_API_BASE_URL, () => getAuthProvider().getAccessToken());
    }
  }
  return dataProvider;
};

/** The demo provider with its development controls, or null when a real API is configured. */
export const getDemoProvider = (): LocalDemoProvider | null => {
  getDataProvider();
  return demoProvider;
};

export type { AuthProvider, RiderDataProvider } from './types';
