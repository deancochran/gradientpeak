import { useAuth } from "@/lib/contexts";
import { Button } from "./ui/button";

export const SignOutButton = () => {
  const { signOut, loading } = useAuth();

  const onSignOutPress = async () => {
    try {
      await signOut();
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
