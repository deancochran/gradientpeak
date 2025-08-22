import { useAuth } from "@clerk/clerk-expo";
import { Button } from "./ui/button";


export const SignOutButton = () => {
  // Use `useClerk()` to access the `signOut()` function
  const { signOut } = useAuth();

   const onSignOutPress = async () => {
    try {
      await signOut({ redirectUrl: "/" });
    } catch (err: any) {}
  };

  return (
    <Button testID="sign-out-button" onPress={onSignOutPress}>
          Sign out
    </Button>
  );
};
