import { Session } from "@supabase/supabase-js";
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
  isAuthenticated: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  loading: true,
  isAuthenticated: false,
  signOut: async () => {},
});

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Simple authentication check - user exists and email is confirmed
  const isAuthenticated = !!session?.user?.email_confirmed_at;

  const signOut = async (): Promise<void> => {
    try {
      setLoading(true);

      // Immediately clear local session state
      setSession(null);
      console.log("📝 Sign out: Cleared local session state");

      // Check if there's an active session before attempting sign out
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();

      if (!currentSession) {
        console.log("📝 Sign out: No active session to sign out");
        return;
      }

      const { error } = await supabase.auth.signOut();
      if (error) {
        // Handle AuthSessionMissingError gracefully - user is already signed out
        if (error.message?.includes("Auth session missing")) {
          console.log("📝 Sign out: Session already cleared");
        } else {
          console.error("Sign out error:", error);
          // Even on error, keep local session cleared since we already cleared it
        }
      } else {
        console.log("📝 Sign out: Successfully signed out");
      }
    } catch (err: any) {
      // Handle AuthSessionMissingError gracefully - user is already signed out
      if (err.message?.includes("Auth session missing")) {
        console.log("📝 Sign out: Session already cleared");
      } else {
        console.error("Sign out error:", err);
        // Even on error, keep local session cleared since we already cleared it
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    // Get initial session
    const getInitialSession = async () => {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error) {
          console.error("🔧 Auth: Error getting session:", error);
        }

        if (isMounted) {
          setSession(session);
          setLoading(false);
        }
      } catch (error) {
        console.error("🔧 Auth: Unexpected error:", error);
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    getInitialSession();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("🔧 Auth: State changed", {
        event,
        hasSession: !!session,
        userEmail: session?.user?.email,
        isVerified: !!session?.user?.email_confirmed_at,
        isMounted,
      });

      if (isMounted) {
        setSession(session);
        setLoading(false);

        // Handle specific auth events for better UX
        switch (event) {
          case "SIGNED_OUT":
            console.log("🚪 User signed out - session cleared");
            // Ensure session is fully cleared
            setSession(null);
            break;
          case "SIGNED_IN":
            console.log("🚪 User signed in", {
              verified: !!session?.user?.email_confirmed_at,
            });
            break;
          case "TOKEN_REFRESHED":
            console.log("🔄 Token refreshed");
            break;
          case "USER_UPDATED":
            console.log("👤 User updated");
            break;
        }
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Debug logging for auth state
  React.useEffect(() => {
    console.log("🔍 Auth Context State:", {
      hasSession: !!session,
      isAuthenticated,
      loading,
      userEmail: session?.user?.email,
      emailConfirmed: !!session?.user?.email_confirmed_at,
    });
  }, [session, isAuthenticated, loading]);

  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        isAuthenticated,
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
