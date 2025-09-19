import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useAuth } from './useAuth';

/**
 * Hook that enforces authentication and redirects to login if not authenticated
 * Use this in protected routes
 */
export const useRequireAuth = (redirectTo = '/(external)/sign-in' as const) => {
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!auth.isLoading && !auth.isAuthenticated) {
      router.replace(redirectTo);
    }
  }, [auth.isLoading, auth.isAuthenticated, router, redirectTo]);

  return auth;
};

/**
 * Hook that redirects authenticated users away from public pages
 * Use this in public routes like login/signup
 */
export const useRedirectIfAuthenticated = (redirectTo = '/(internal)/(tabs)' as const) => {
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!auth.isLoading && auth.isAuthenticated) {
      router.replace(redirectTo);
    }
  }, [auth.isLoading, auth.isAuthenticated, router, redirectTo]);

  return auth;
};
