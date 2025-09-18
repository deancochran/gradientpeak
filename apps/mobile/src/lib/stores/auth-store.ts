import AsyncStorage from "@react-native-async-storage/async-storage";
import { Session, User } from "@supabase/supabase-js";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { supabase } from "../supabase";
import { trpc } from "../trpc";

export interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  initialized: boolean;
  hydrated: boolean;
  isAuthenticated: boolean;

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

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      session: null,
      user: null,
      loading: true,
      initialized: false,
      hydrated: false,
      isAuthenticated: false,

      setSession: (session) => {
        set({
          session,
          user: session?.user || null,
          isAuthenticated: !!session?.user?.email_confirmed_at,
        });
      },

      setLoading: (loading) => set({ loading }),
      setInitialized: (initialized) => set({ initialized }),
      setHydrated: (hydrated) => set({ hydrated }),

      signOut: async () => {
        const { setSession, setLoading } = get();
        try {
          setLoading(true);
          setSession(null);

          const {
            data: { session: currentSession },
          } = await supabase.auth.getSession();

          if (!currentSession) return;

          await trpc.auth.signOut.mutate();
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
          const { session } = await trpc.auth.signInWithPassword.mutate({
            email,
            password,
          });
          if (session) get().setSession(session);
          return { error: null };
        } catch (err) {
          return { error: err as Error };
        } finally {
          setLoading(false);
        }
      },

      signUp: async (email, password, metadata) => {
        const { setLoading } = get();
        try {
          setLoading(true);
          const { session } = await trpc.auth.signUp.mutate({
            email,
            password,
            metadata,
          });
          if (session) get().setSession(session);
          return { error: null };
        } catch (err) {
          return { error: err as Error };
        } finally {
          setLoading(false);
        }
      },

      resetPassword: async (email) => {
        try {
          await trpc.auth.sendPasswordResetEmail.mutate({
            email,
            redirectTo: "turbofit://reset-password",
          });
          return { error: null };
        } catch (err) {
          return { error: err as Error };
        }
      },

      initialize: async () => {
        const { setSession, setInitialized, setLoading } = get();
        if (get().initialized) return;

        setLoading(true);
        try {
          const {
            data: { session },
            error,
          } = await supabase.auth.getSession();

          if (error) console.error("Auth Store init error:", error);

          setSession(session);

          supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
          });

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
      partialize: (state) => ({ initialized: state.initialized }),
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

// Convenience hooks
export const useAuth = () => {
  const store = useAuthStore();
  if (store.hydrated && !store.initialized) {
    store.initialize();
  }
  return store;
};
export const useSession = () => useAuthStore((s) => s.session);
export const useUser = () => useAuthStore((s) => s.user);
export const useIsAuthenticated = () => useAuthStore((s) => s.isAuthenticated);
export const useAuthHydrated = () => useAuthStore((s) => s.hydrated);
