import AsyncStorage from "@react-native-async-storage/async-storage";
import { Session, User } from "@supabase/supabase-js";
import { router } from "expo-router";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { supabase } from "../supabase";

export interface AuthState {
  // State
  session: Session | null;
  user: User | null;
  loading: boolean;
  initialized: boolean;
  isAuthenticated: boolean;

  // Actions
  setSession: (session: Session | null) => void;
  setLoading: (loading: boolean) => void;
  setInitialized: (initialized: boolean) => void;
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

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // Initial state
      session: null,
      user: null,
      loading: true,
      initialized: false,
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

          // Navigate to welcome screen
          router.replace("/(external)/welcome");
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

            // Handle navigation based on auth state
            const isAuthenticated = !!session?.user?.email_confirmed_at;

            switch (event) {
              case "SIGNED_OUT":
                console.log(
                  "🚪 Auth Store: User signed out - navigating to welcome",
                );
                router.replace("/(external)/welcome");
                break;
              case "SIGNED_IN":
                if (isAuthenticated) {
                  console.log(
                    "🚪 Auth Store: User signed in - navigating to internal",
                  );
                  router.replace("/(internal)");
                }
                break;
              case "TOKEN_REFRESHED":
                console.log("🔄 Auth Store: Token refreshed");
                break;
              case "USER_UPDATED":
                console.log("👤 Auth Store: User updated");
                break;
            }
          });
        } catch (error) {
          console.error("🔧 Auth Store: Unexpected error:", error);
        } finally {
          setLoading(false);
          setInitialized(true);
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
    },
  ),
);

// Convenience hooks
export const useAuth = () => useAuthStore();
export const useSession = () => useAuthStore((state) => state.session);
export const useUser = () => useAuthStore((state) => state.user);
export const useIsAuthenticated = () =>
  useAuthStore((state) => state.isAuthenticated);
