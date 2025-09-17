import AsyncStorage from "@react-native-async-storage/async-storage";
import { Session, User } from "@supabase/supabase-js";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { supabase } from "../supabase";

export interface AuthState {
  // State
  session: Session | null;
  user: User | null;
  loading: boolean;
  initialized: boolean;
  hydrated: boolean;
  isAuthenticated: boolean;

  // Actions
  setSession: (session: Session | null) => void;
  setLoading: (loading: boolean) => void;
  setInitialized: (initialized: boolean) => void;
  setHydrated: (hydrated: boolean) => void;
  signOut: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (
    email: string,
    password: string,
    metadata?: Record<string, unknown>,
  ) => Promise<{ error: Error | null }>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
  initialize: () => Promise<void>;
}

let _autoInitialized = false;
let _initializationInProgress = false;

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // Initial state
      session: null,
      user: null,
      loading: true,
      initialized: false,
      hydrated: false, // Will be set to true after persistence rehydration
      isAuthenticated: false,

      // Actions
      setSession: (session) => {
        const isAuthenticated = !!session?.user?.email_confirmed_at;
        set({
          session,
          user: session?.user || null,
          isAuthenticated,
        });
      },

      setLoading: (loading) => set({ loading }),

      setInitialized: (initialized) => set({ initialized }),

      setHydrated: (hydrated) => set({ hydrated }),

      signOut: async () => {
        const { setSession, setLoading } = get();

        try {
          setLoading(true);

          // Clear local state immediately
          setSession(null);

          // Check if there's an active session before attempting sign out
          const {
            data: { session: currentSession },
          } = await supabase.auth.getSession();

          if (!currentSession) {
            return;
          }

          const { error } = await supabase.auth.signOut();
          if (error && !error.message?.includes("Auth session missing")) {
            console.error("Auth Store sign out error:", error);
          }
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          if (!errorMessage.includes("Auth session missing")) {
            console.error("Auth Store sign out error:", err);
          }
        } finally {
          setLoading(false);
        }
      },

      signIn: async (email: string, password: string) => {
        const { setLoading } = get();

        try {
          setLoading(true);
          const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
          });

          if (error) {
            return { error };
          }

          return { error: null };
        } catch (err) {
          return { error: err as Error };
        } finally {
          setLoading(false);
        }
      },

      signUp: async (
        email: string,
        password: string,
        metadata?: Record<string, unknown>,
      ) => {
        const { setLoading } = get();

        try {
          setLoading(true);
          const { error } = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: metadata,
            },
          });

          if (error) {
            return { error };
          }

          return { error: null };
        } catch (err) {
          return { error: err as Error };
        } finally {
          setLoading(false);
        }
      },

      resetPassword: async (email: string) => {
        try {
          const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: "turbofit://reset-password",
          });

          if (error) {
            return { error };
          }

          return { error: null };
        } catch (err) {
          return { error: err as Error };
        }
      },

      initialize: async () => {
        if (_autoInitialized) {
          return;
        }

        if (_initializationInProgress) {
          return;
        }

        _initializationInProgress = true;
        const { setSession, setLoading, setInitialized } = get();

        try {
          setLoading(true);

          const {
            data: { session },
            error,
          } = await supabase.auth.getSession();

          if (error) {
            console.error("Auth Store: Error getting session:", error);
          }

          setSession(session);

          // Set up auth state change listener
          supabase.auth.onAuthStateChange((event, session) => {
            setSession(session);
          });

          _autoInitialized = true;
        } catch (error) {
          console.error("Auth Store: Unexpected error:", error);
          _autoInitialized = false; // Reset on error
        } finally {
          setLoading(false);
          setInitialized(true);
          _initializationInProgress = false;
        }
      },
    }),
    {
      name: "turbofit-auth-store",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        // Only persist non-sensitive data
        initialized: state.initialized,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (state && !error) {
          state.setHydrated(true);
          // Also auto-initialize after hydration
          if (!_autoInitialized) {
            state.initialize();
          }
        } else if (error) {
          console.error("Auth Store: Rehydration error:", error);
          // Still set hydrated to true to prevent blocking
          if (state) {
            state.setHydrated(true);
          }
        }
      },
    },
  ),
);

// Initialize hydrated state for non-persisted usage
setTimeout(() => {
  const state = useAuthStore.getState();
  if (!state.hydrated) {
    state.setHydrated(true);
    // Also initialize if not done yet
    if (!_autoInitialized) {
      state.initialize();
    }
  }
}, 100);

// Convenience hooks with auto-initialization
export const useAuth = () => {
  const store = useAuthStore();
  if (!_autoInitialized && store.hydrated) {
    store.initialize();
  }
  return store;
};
export const useSession = () => useAuthStore((state) => state.session);
export const useUser = () => useAuthStore((state) => state.user);
export const useIsAuthenticated = () =>
  useAuthStore((state) => state.isAuthenticated);
export const useAuthHydrated = () => useAuthStore((state) => state.hydrated);
