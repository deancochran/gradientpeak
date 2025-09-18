/**
 * Auth API utilities for use in non-React contexts (like Zustand stores)
 * These are direct tRPC client calls, not React hooks
 */

import { trpc } from '../trpc';

// Get the tRPC client instance (this will be available after provider setup)
let trpcClient: ReturnType<typeof trpc.createClient> | null = null;

// This function should be called after the tRPC provider is set up
export const initAuthApi = (client: ReturnType<typeof trpc.createClient>) => {
  trpcClient = client;
};

// Direct tRPC calls for use in stores
export const authApi = {
  signIn: async (email: string, password: string) => {
    if (!trpcClient) throw new Error('tRPC client not initialized');
    return trpcClient.auth.signInWithPassword.mutate({ email, password });
  },

  signUp: async (email: string, password: string, metadata?: Record<string, unknown>) => {
    if (!trpcClient) throw new Error('tRPC client not initialized');
    return trpcClient.auth.signUp.mutate({ email, password, metadata });
  },

  signOut: async () => {
    if (!trpcClient) throw new Error('tRPC client not initialized');
    return trpcClient.auth.signOut.mutate();
  },

  sendPasswordResetEmail: async (email: string, redirectTo: string) => {
    if (!trpcClient) throw new Error('tRPC client not initialized');
    return trpcClient.auth.sendPasswordResetEmail.mutate({ email, redirectTo });
  },
};
