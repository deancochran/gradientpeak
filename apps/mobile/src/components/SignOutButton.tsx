import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { trpc } from "@/lib/trpc";

export const SignOutButton = () => {
  const signOutMutation = trpc.auth.signOut.useMutation();
  const loading = signOutMutation.isPending;

  return (
    <Button
      testID="sign-out-button"
      onPress={() => signOutMutation.mutate()}
      disabled={loading}
    >
      <Text>{loading ? "Signing out..." : "Sign out"}</Text>
    </Button>
  );
};
