import type { AuthError, Session, User } from "@supabase/supabase-js";
import {
    createContext,
    ReactNode,
    useContext,
    useEffect,
    useState,
} from "react";
import { Alert } from "react-native";
import { auth, profiles, supabase, type Profile } from "../supabase";

interface AuthContextType {
  // Auth state
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  initializing: boolean;

  // Auth actions
  signUp: (email: string, password: string) => Promise<{
    user: User | null;
    error: AuthError | null;
  }>;
  signIn: (email: string, password: string) => Promise<{
    user: User | null;
    error: AuthError | null;
  }>;
  signOut: () => Promise<{ error: AuthError | null }>;
  resetPassword: (email: string) => Promise<{ error: AuthError | null }>;
  updatePassword: (password: string) => Promise<{ error: AuthError | null }>;

  // Profile actions
  updateProfile: (updates: Partial<Profile>) => Promise<{
    profile: Profile | null;
    error: any;
  }>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);

  // Initialize auth state
  useEffect(() => {
    let mounted = true;

    async function getInitialSession() {
      try {
        const { data: sessionData, error: sessionError } = await auth.getSession();

        if (sessionError) {
          console.error("Error getting session:", sessionError);
        } else if (sessionData.session && mounted) {
          setSession(sessionData.session);
          setUser(sessionData.session.user);

          // Load user profile
          await loadUserProfile(sessionData.session.user.id);
        }
      } catch (error) {
        console.error("Error initializing auth:", error);
      } finally {
        if (mounted) {
          setInitializing(false);
        }
      }
    }

    getInitialSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log("Auth state change:", event);

        if (mounted) {
          setSession(session);
          setUser(session?.user ?? null);

          if (session?.user) {
            await loadUserProfile(session.user.id);
          } else {
            setProfile(null);
          }

          setInitializing(false);
        }
      }
    );

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  const loadUserProfile = async (userId: string) => {
    try {
      const { data, error } = await profiles.getProfile(userId);
      if (error) {
        console.error("Error loading profile:", error);
        // If profile doesn't exist, create a basic one
        if (error.code === 'PGRST116') {
          const { data: newProfile, error: createError } = await profiles.upsertProfile({
            id: userId,
            updated_at: new Date().toISOString(),
          });

          if (createError) {
            console.error("Error creating profile:", createError);
          } else {
            setProfile(newProfile);
          }
        }
      } else {
        setProfile(data);
      }
    } catch (error) {
      console.error("Error in loadUserProfile:", error);
    }
  };

  const handleSignUp = async (email: string, password: string) => {
    setLoading(true);
    try {
      const { data, error } = await auth.signUp(email, password);

      if (error) {
        Alert.alert("Sign Up Error", error.message);
        return { user: null, error };
      }

      if (data.user && !data.user.email_confirmed_at) {
        Alert.alert(
          "Check Your Email",
          "We sent you a confirmation link. Please check your email to activate your account."
        );
      }

      return { user: data.user, error: null };
    } catch (error) {
      const authError = error as AuthError;
      Alert.alert("Sign Up Error", authError.message);
      return { user: null, error: authError };
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async (email: string, password: string) => {
    setLoading(true);
    try {
      const { data, error } = await auth.signIn(email, password);

      if (error) {
        Alert.alert("Sign In Error", error.message);
        return { user: null, error };
      }

      return { user: data.user, error: null };
    } catch (error) {
      const authError = error as AuthError;
      Alert.alert("Sign In Error", authError.message);
      return { user: null, error: authError };
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    setLoading(true);
    try {
      const { error } = await auth.signOut();

      if (error) {
        Alert.alert("Sign Out Error", error.message);
        return { error };
      }

      // Clear local state
      setUser(null);
      setSession(null);
      setProfile(null);

      return { error: null };
    } catch (error) {
      const authError = error as AuthError;
      Alert.alert("Sign Out Error", authError.message);
      return { error: authError };
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (email: string) => {
    setLoading(true);
    try {
      const { error } = await auth.resetPassword(email);

      if (error) {
        Alert.alert("Reset Password Error", error.message);
        return { error };
      }

      Alert.alert(
        "Check Your Email",
        "We sent you a password reset link. Please check your email."
      );

      return { error: null };
    } catch (error) {
      const authError = error as AuthError;
      Alert.alert("Reset Password Error", authError.message);
      return { error: authError };
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (password: string) => {
    setLoading(true);
    try {
      const { error } = await auth.updatePassword(password);

      if (error) {
        Alert.alert("Update Password Error", error.message);
        return { error };
      }

      Alert.alert("Success", "Your password has been updated successfully.");

      return { error: null };
    } catch (error) {
      const authError = error as AuthError;
      Alert.alert("Update Password Error", authError.message);
      return { error: authError };
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProfile = async (updates: Partial<Profile>) => {
    if (!user) {
      return { profile: null, error: new Error("No authenticated user") };
    }

    setLoading(true);
    try {
      const { data, error } = await profiles.updateProfile(user.id, updates);

      if (error) {
        Alert.alert("Profile Update Error", error.message);
        return { profile: null, error };
      }

      setProfile(data);
      return { profile: data, error: null };
    } catch (error) {
      Alert.alert("Profile Update Error", "Failed to update profile");
      return { profile: null, error };
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshProfile = async () => {
    if (!user) return;

    await loadUserProfile(user.id);
  };

  const value: AuthContextType = {
    // State
    user,
    session,
    profile,
    loading,
    initializing,

    // Actions
    signUp: handleSignUp,
    signIn: handleSignIn,
    signOut: handleSignOut,
    resetPassword: handleResetPassword,
    updatePassword: handleUpdatePassword,
    updateProfile: handleUpdateProfile,
    refreshProfile: handleRefreshProfile,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

// Helper hooks
export function useUser() {
  const { user } = useAuth();
  return user;
}

export function useProfile() {
  const { profile } = useAuth();
  return profile;
}

export function useSession() {
  const { session } = useAuth();
  return session;
}
