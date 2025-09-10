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
          console.log("📝 Auth Store: Cleared local session state");

          // Check if there's an active session before attempting sign out
          const {
            data: { session: currentSession },
          } = await supabase.auth.getSession();

          if (!currentSession) {
            console.log("📝 Auth Store: No active session to sign out");
            return;
          }

          const { error } = await supabase.auth.signOut();
          if (error) {
            if (error.message?.includes("Auth session missing")) {
              console.log("📝 Auth Store: Session already cleared");
            } else {
              console.error("Auth Store sign out error:", error);
            }
          } else {
            console.log("📝 Auth Store: Successfully signed out");
          }

          // Let layouts handle navigation
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          if (errorMessage.includes("Auth session missing")) {
            console.log("📝 Auth Store: Session already cleared");
          } else {
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
            console.error("Auth Store sign in error:", error);
            return { error };
          }

          console.log("✅ Auth Store: Sign in successful");
          return { error: null };
        } catch (err) {
          console.error("Auth Store sign in error:", err);
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
            console.error("Auth Store sign up error:", error);
            return { error };
          }

          console.log("✅ Auth Store: Sign up successful");
          return { error: null };
        } catch (err) {
          console.error("Auth Store sign up error:", err);
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
            console.error("Auth Store reset password error:", error);
            return { error };
          }

          console.log("✅ Auth Store: Password reset email sent");
          return { error: null };
        } catch (err) {
          console.error("Auth Store reset password error:", err);
          return { error: err as Error };
        }
      },

      initialize: async () => {
        if (_autoInitialized) {
          console.log("🔐 Auth Store: Already initialized, skipping");
          return;
        }

        if (_initializationInProgress) {
          console.log("🔐 Auth Store: Initialization in progress, waiting...");
          return;
        }

        _initializationInProgress = true;
        const { setSession, setLoading, setInitialized } = get();

        try {
          console.log("🔐 Auth Store: Initializing auth state...");
          setLoading(true);

          const {
            data: { session },
            error,
          } = await supabase.auth.getSession();

          if (error) {
            console.error("🔧 Auth Store: Error getting session:", error);
          }

          setSession(session);
          console.log("✅ Auth Store: Initialized", {
            hasSession: !!session,
            userEmail: session?.user?.email,
            isVerified: !!session?.user?.email_confirmed_at,
          });

          // Set up auth state change listener
          supabase.auth.onAuthStateChange((event, session) => {
            console.log("🔧 Auth Store: State changed", {
              event,
              hasSession: !!session,
              userEmail: session?.user?.email,
              isVerified: !!session?.user?.email_confirmed_at,
            });

            setSession(session);

            // Just log auth events - let layouts handle navigation
            switch (event) {
              case "SIGNED_OUT":
                console.log("🚪 Auth Store: User signed out");
                break;
              case "SIGNED_IN":
                console.log("🚪 Auth Store: User signed in");
                break;
              case "TOKEN_REFRESHED":
                console.log("🔄 Auth Store: Token refreshed");
                break;
              case "USER_UPDATED":
                console.log("👤 Auth Store: User updated");
                break;
            }
          });

          _autoInitialized = true;
        } catch (error) {
          console.error("🔧 Auth Store: Unexpected error:", error);
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
        console.log("🔐 Auth Store: Rehydration complete", {
          hasState: !!state,
          error: error?.message || null,
          autoInitialized: _autoInitialized,
        });
        if (state && !error) {
          console.log("🔐 Auth Store: Setting hydrated to true");
          state.setHydrated(true);
          // Also auto-initialize after hydration
          if (!_autoInitialized) {
            console.log("🔐 Auth Store: Auto-initializing after hydration");
            state.initialize();
          }
        } else if (error) {
          console.error("🔐 Auth Store: Rehydration error:", error);
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
  console.log("🔐 Auth Store: Checking hydration state", {
    hydrated: state.hydrated,
    initialized: state.initialized,
    loading: state.loading,
  });
  if (!state.hydrated) {
    console.log("🔐 Auth Store: Setting hydrated to true (fallback)");
    state.setHydrated(true);
    // Also initialize if not done yet
    if (!_autoInitialized) {
      console.log("🔐 Auth Store: Auto-initializing (fallback)");
      state.initialize();
    }
  }
}, 100);

// Convenience hooks with auto-initialization
export const useAuth = () => {
  const store = useAuthStore();
  if (!_autoInitialized && store.hydrated) {
    console.log("🔐 Auth Store: Auto-initializing from hook...");
    store.initialize();
  }
  return store;
};
export const useSession = () => useAuthStore((state) => state.session);
export const useUser = () => useAuthStore((state) => state.user);
export const useIsAuthenticated = () =>
  useAuthStore((state) => state.isAuthenticated);
export const useAuthHydrated = () => useAuthStore((state) => state.hydrated);
