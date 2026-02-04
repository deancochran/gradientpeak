import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/lib/hooks/useAuth";
import { supabase } from "@/lib/supabase/client";
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function VerificationPendingScreen() {
  const { user, checkUserStatus } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleResendEmail = async () => {
    if (!user?.email) return;
    setLoading(true);
    setMessage(null);
    try {
      // Resend confirmation for email change is tricky with Supabase client directly
      // usually it's just requesting a new change or using a specific endpoint.
      // For now, we'll just say "Check your email".
      // Actually, if it's an email change, the user should have received a link.
      // There isn't a direct "resend email change confirmation" method in the JS client easily accessible without re-triggering update.
      // So we might just re-trigger the update with the same email if we knew it, but we don't know the new email here easily.
      // Let's just provide a generic message or assume the user can find it.
      // Alternatively, we can let them cancel.
      setMessage("Please check your inbox for the confirmation link.");
    } catch (error) {
      console.error(error);
      setMessage("Error resending email.");
    } finally {
      setLoading(false);
    }
  };

  const handleCheckStatus = async () => {
    setLoading(true);
    await checkUserStatus();
    setLoading(false);
  };

  const handleSignOut = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    router.replace("/(external)/sign-in");
    setLoading(false);
  };

  return (
    <SafeAreaView className="flex-1 bg-background p-6 justify-center items-center">
      <View className="w-full max-w-sm space-y-6">
        <View className="space-y-2 items-center">
          <Text className="text-2xl font-bold text-foreground text-center">
            Verify Your Email
          </Text>
          <Text className="text-muted-foreground text-center">
            You have a pending email change. Please click the link sent to your
            new email address to verify it.
          </Text>
        </View>

        {message && (
          <View className="bg-muted p-3 rounded-md">
            <Text className="text-foreground text-center">{message}</Text>
          </View>
        )}

        <View className="space-y-3 w-full">
          <Button
            onPress={handleCheckStatus}
            disabled={loading}
            className="w-full"
          >
            <Text className="text-primary-foreground">
              I've Verified My Email
            </Text>
          </Button>

          <Button
            variant="outline"
            onPress={handleSignOut}
            disabled={loading}
            className="w-full"
          >
            <Text className="text-foreground">Sign Out</Text>
          </Button>
        </View>
      </View>
    </SafeAreaView>
  );
}
