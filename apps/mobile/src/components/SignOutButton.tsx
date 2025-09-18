import { Button, Text } from "@/components/ui/button";

export const SignOutButton = () => {
  const { signOut, loading } = useAuthStore();

  return (
    <Button
      testID="sign-out-button"
      onPress={() => signOut()}
      disabled={loading}
    >
      <Text>{loading ? "Signing out..." : "Sign out"}</Text>
    </Button>
  );
};
