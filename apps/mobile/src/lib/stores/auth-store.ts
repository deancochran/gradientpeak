import { supabase } from "@/lib/supabase/client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { PublicProfilesRow } from "@repo/supabase";
import { Session, User } from "@supabase/supabase-js";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { trpc } from "../trpc";

export interface Profile extends Omit<PublicProfilesRow, "created_at" | "idx"> {
  created_at?: string;
  idx?: number;
}

export interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  initialized: boolean;
  hydrated: boolean;
  isAuthenticated: boolean;
  error: Error | null;

  setSession: (session: Session | null) => void;
  setUser: (user: User | null) => void;
  setProfile: (profile: Profile | null) => void;
  setLoading: (loading: boolean) => void;
  setInitialized: (initialized: boolean) => void;
  setHydrated: (hydrated: boolean) => void;
  setError: (error: Error | null) => void;

  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (
    email: string,
    password: string,
    metadata?: Record<string, unknown>,
  ) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
  initialize: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      session: null,

      user: null,
      profile: null,
      loading: true,
      initialized: false,
      hydrated: false,
      isAuthenticated: false,
      error: null,

      setSession: (session: Session | null) => {
        set({
          session,
          user: session?.user || null,
          isAuthenticated: !!session?.user?.email_confirmed_at,
        });
      },

      setUser: (user: User | null) => set({ user }),
      setProfile: (profile: Profile | null) => set({ profile }),
      setLoading: (loading: boolean) => set({ loading }),
      setInitialized: (initialized: boolean) => set({ initialized }),
      setHydrated: (hydrated: boolean) => set({ hydrated }),
      setError: (error: Error | null) => set({ error }),

      refreshProfile: async () => {
        const { user, setProfile, setError } = get();
        if (!user) {
          setProfile(null);
          return;
        }

        try {
          const profile = await trpc.profiles.get();
          setProfile(profile);
          setError(null);
        } catch (err) {
          console.error("Failed to refresh profile:", err);
          setError(err as Error);
          // Don't clear profile on error - keep stale data while we retry
        }
      },

      signOut: async () => {
        const { setSession, setProfile, setLoading } = get();
        try {
          setLoading(true);
          setSession(null);
          setProfile(null);

          const {
            data: { session: currentSession },
          } = await supabase.auth.getSession();

          if (!currentSession) return;

          await trpc.auth.signOut();
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
        const { setLoading, setSession, refreshProfile } = get();
        try {
          setLoading(true);
          const { session } = await trpc.auth.signInWithPassword({
            email,
            password,
          });

          if (session) {
            setSession(session);
            await refreshProfile();
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
        const { setLoading, setSession, refreshProfile } = get();
        try {
          setLoading(true);
          const { session } = await trpc.auth.signUp({
            email,
            password,
            metadata,
          });

          if (session) {
            setSession(session);
            await refreshProfile();
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
          await trpc.auth.sendPasswordResetEmail({
            email,
            redirectTo: "turbofit://reset-password",
          });
          return { error: null };
        } catch (err) {
          return { error: err as Error };
        }
      },

      initialize: async () => {
        const { setSession, setInitialized, setLoading, refreshProfile } =
          get();
        if (get().initialized) return;

        setLoading(true);
        try {
          const {
            data: { session },
            error,
          } = await supabase.auth.getSession();

          if (error) console.error("Auth Store init error:", error);

          setSession(session);

          // Set up auth state change listener
          supabase.auth.onAuthStateChange(async (_event, session) => {
            setSession(session);
            if (session?.user) {
              await refreshProfile();
            } else {
              get().setProfile(null);
            }
          });

          // If we have a user, fetch their profile
          if (session?.user) {
            await refreshProfile();
          }

          setInitialized(true);
        } catch (err) {
          console.error("Auth Store unexpected init error:", err);
        } finally {
          setLoading(false);
        }
      },
    }),
    {
      name: "turbofit-auth-store",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        session: state.session,
        user: state.user,
        profile: state.profile,
        initialized: state.initialized,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (state && !error) {
          state.setHydrated(true);
          state.initialize();
        } else if (error && state) {
          console.error("Auth Store rehydrate error:", error);
          state.setHydrated(true);
        }
      },
    },
  ),
);

// Combined hook for easy access to all auth data
export const useAuth = () => {
  const store = useAuthStore();
  if (store.hydrated && !store.initialized) {
    store.initialize();
  }
  return {
    user: store.user,
    profile: store.profile,
    session: store.session,
    loading: store.loading,
    error: store.error,
    isAuthenticated: store.isAuthenticated,
    refreshProfile: store.refreshProfile,
  };
};
