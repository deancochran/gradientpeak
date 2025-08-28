import { useAuth } from "@/lib/contexts";
import { supabase } from "@/lib/supabase";
import { Button } from "./ui/button";

export const SignOutButton = () => {
  const { loading } = useAuth();

  const onSignOutPress = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error("Sign out error:", error);
      }
    } catch (err: any) {
      console.error("Sign out error:", err);
    }
  };

  return (
    <Button
      testID="sign-out-button"
      onPress={onSignOutPress}
      disabled={loading}
    >
      {loading ? "Signing out..." : "Sign out"}
    </Button>
  );
};
