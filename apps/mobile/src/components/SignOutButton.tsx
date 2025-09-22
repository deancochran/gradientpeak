import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { supabase } from "@/lib/supabase/client";
import { useState } from "react";

export const SignOutButton = () => {
  const [loading, setLoading] = useState(false);

  const handleSignOut = async () => {
    setLoading(true);
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error("Error signing out:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button testID="sign-out-button" onPress={handleSignOut} disabled={loading}>
      <Text>{loading ? "Signing out..." : "Sign out"}</Text>
    </Button>
  );
};
