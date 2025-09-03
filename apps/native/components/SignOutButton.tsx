import { useAuth } from "@/contexts/AuthContext";
import { router } from "expo-router";
import { Button } from "./ui/button";

export const SignOutButton = () => {
  const { loading, signOut } = useAuth();

  const onSignOutPress = async () => {
    try {
      console.log("🚪 SignOutButton: Starting sign out process");
      await signOut();

      // Force redirect to welcome screen after sign out
      console.log("🚪 SignOutButton: Redirecting to welcome screen");
      router.replace("/(external)/welcome");
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
