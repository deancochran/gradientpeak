import { supabase } from "@/lib/supabase/client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Session, User } from "@supabase/supabase-js";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  initialized: boolean;
  hydrated: boolean;
  isAuthenticated: boolean;
  error: Error | null;

  setSession: (session: Session | null) => void;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  setInitialized: (initialized: boolean) => void;
  setHydrated: (hydrated: boolean) => void;
  setError: (error: Error | null) => void;

  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      session: null as Session | null,
      user: null as User | null,
      loading: true as boolean,
      initialized: false as boolean,
      hydrated: false as boolean,
      isAuthenticated: false as boolean,
      error: null as Error | null,

      setSession: (session: Session | null) => {
        set({
          session,
          user: session?.user || null,
          isAuthenticated: !!session?.user?.email_confirmed_at,
        });
      },

      setUser: (user: User | null) => set({ user }),
      setLoading: (loading: boolean) => set({ loading }),
      setInitialized: (initialized: boolean) => set({ initialized }),
      setHydrated: (hydrated: boolean) => set({ hydrated }),
      setError: (error: Error | null) => set({ error }),

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

          // Set up auth state change listener
          supabase.auth.onAuthStateChange(async (_event, session) => {
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
      partialize: (state) => ({
        session: state.session,
        user: state.user,
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
