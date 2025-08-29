import { Session } from "@supabase/supabase-js";
import { router } from "expo-router";
import React, {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { supabase } from "../supabase";

interface AuthContextType {
  session: Session | null;
  loading: boolean;
  isValidSession: boolean;
  refreshSession: () => Promise<boolean>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  loading: true,
  isValidSession: false,
  refreshSession: async () => false,
  signOut: async () => {},
});

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isValidSession, setIsValidSession] = useState(false);

  // Function to refresh the session
  const refreshSession = async (): Promise<boolean> => {
    try {
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        console.error("🔧 AuthProvider: Error refreshing session:", error);
        setIsValidSession(false);
        setSession(null);
        return false;
      }

      setSession(data.session);
      setIsValidSession(!!data.session);
      return !!data.session;
    } catch (err) {
      console.error(
        "🔧 AuthProvider: Unexpected error refreshing session:",
        err,
      );
      setIsValidSession(false);
      setSession(null);
      return false;
    }
  };

  // Function to safely sign out
  const signOut = async (): Promise<void> => {
    try {
      setLoading(true);
      const { error } = await supabase.auth.signOut();

      if (error) {
        console.error("Sign out error:", error);

        // If the error is AuthSessionMissingError, we should still redirect to auth
        if (error.message.includes("Auth session missing")) {
          setSession(null);
          setIsValidSession(false);
          router.replace("/(external)/sign-in");
        }
      } else {
        setSession(null);
        setIsValidSession(false);
      }
    } catch (err) {
      console.error("Sign out error:", err);
      setSession(null);
      setIsValidSession(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    console.log("🔧 AuthProvider: Setting up auth listeners");

    let isMounted = true;

    // Get initial session
    supabase.auth
      .getSession()
      .then(({ data: { session }, error }) => {
        if (error) {
          console.error("🔧 AuthProvider: Error getting session:", error);
        } else {
          console.log("🔧 AuthProvider: Initial session loaded", {
            hasSession: !!session,
            userEmail: session?.user?.email,
          });
        }

        if (isMounted) {
          setSession(session);
          setIsValidSession(!!session);
          setLoading(false);
        }
      })
      .catch((error) => {
        console.error("🔧 AuthProvider: Unexpected error:", error);
        if (isMounted) {
          setIsValidSession(false);
          setLoading(false);
        }
      });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("🔧 AuthProvider: Auth state changed", {
        event,
        hasSession: !!session,
        userEmail: session?.user?.email,
      });

      if (isMounted) {
        setSession(session);
        setIsValidSession(!!session);
        setLoading(false);

        // Redirect to auth screen if user signed out or token expired
        if (
          event === "SIGNED_OUT" ||
          (event === "TOKEN_REFRESHED" && !session)
        ) {
          router.replace("/(external)/sign-in");
        }
      }
    });

    return () => {
      console.log("🔧 AuthProvider: Cleaning up auth subscription");
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        isValidSession,
        refreshSession,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

// Helper hooks for convenience
export function useSession() {
  const { session } = useAuth();
  return session;
}

export function useUser() {
  const { session } = useAuth();
  return session?.user ?? null;
}
