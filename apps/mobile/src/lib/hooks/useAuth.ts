import { useAuthStore } from '@/lib/stores/auth-store';
import { trpc } from '@/lib/trpc';
import { useEffect } from 'react';

/**
 * Simplified auth hook that combines Zustand persistence with tRPC reactivity
 * Provides a single source of truth for authentication state
 */
export const useAuth = () => {
  const store = useAuthStore();
  const {
    data: user,
    isLoading: trpcLoading,
    error,
    refetch,
  } = trpc.auth.getUser.useQuery(undefined, {
    retry: false,
    staleTime: 1000 * 60 * 5, // 5 minutes
    enabled: store.isAuthenticated, // Only fetch if store thinks we're authenticated
  });

  // Sync tRPC user data with Zustand store
  useEffect(() => {
    if (user && !trpcLoading) {
      // Update store with fresh user data from tRPC if user IDs match
      if (store.user?.id === user.id) {
        // Create a minimal session update to keep store consistent
        const updatedSession = store.session ? {
          ...store.session,
          user: user
        } : null;

        store.setSession(updatedSession);
      }
    } else if (error && !trpcLoading && store.isAuthenticated) {
      // Clear store if tRPC indicates we're not authenticated but store thinks we are
      store.setSession(null);
    }
  }, [user, trpcLoading, error, store]);

  // Initialize auth if not already initialized
  useEffect(() => {
    if (store.hydrated && !store.initialized) {
      store.initialize();
    }
  }, [store.hydrated, store.initialized, store]);

  const refreshSession = () => {
    void refetch();
  };

  // Combined loading state
  const isLoading = store.loading || trpcLoading;

  // Combined authentication state - both store and tRPC must agree
  const isAuthenticated = store.isAuthenticated && !!user && !error;

  return {
    // Core state
    user: store.user,
    session: store.session,
    isLoading,
    isAuthenticated,
    error,

    // Auth actions
    signIn: store.signIn,
    signUp: store.signUp,
    signOut: store.signOut,
    resetPassword: store.resetPassword,
    refreshSession,

    // Convenience properties
    hasError: !!error,
    isHydrated: store.hydrated,
    isInitialized: store.initialized,
  };
};

/**
 * Hook that provides only the user object
 */
export const useUser = () => {
  const auth = useAuth();
  return auth.user;
};

/**
 * Hook that provides only the authentication status
 */
export const useIsAuthenticated = () => {
  const auth = useAuth();
  return auth.isAuthenticated;
};

/**
 * Hook that provides only the loading state
 */
export const useAuthLoading = () => {
  const auth = useAuth();
  return auth.isLoading;
};

/**
 * Hook that provides auth error information
 */
export const useAuthError = () => {
  const auth = useAuth();
  return {
    error: auth.error,
    hasError: auth.hasError,
    clearError: auth.refreshSession,
  };
};
