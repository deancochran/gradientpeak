import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/lib/hooks/useAuth";
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function OnboardingScreen() {
  const { completeOnboarding, user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleFinish = async () => {
    setLoading(true);
    try {
      await completeOnboarding();
      // Navigation to tabs is handled by the global guard in _layout.tsx
      // but we can also push explicitly to be safe/fast
      router.replace("/(tabs)");
    } catch (error) {
      console.error("Failed to complete onboarding:", error);
      // Show error toast
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background p-6 justify-between">
      <View className="space-y-6 mt-10">
        <View className="space-y-2">
          <Text className="text-3xl font-bold text-foreground">
            Welcome to GradientPeak
          </Text>
          <Text className="text-xl text-muted-foreground">
            Let's get you set up.
          </Text>
        </View>

        <View className="bg-muted/50 p-6 rounded-xl space-y-4">
          <Text className="text-foreground text-lg font-medium">
            Account Created
          </Text>
          <Text className="text-muted-foreground">
            Your account is ready. In the future, this screen will help you set
            up your profile, connect devices, and set goals.
          </Text>
          <Text className="text-muted-foreground">Email: {user?.email}</Text>
        </View>
      </View>

      <View className="space-y-4 mb-4">
        <Button onPress={handleFinish} disabled={loading} className="w-full">
          <Text className="text-primary-foreground">
            {loading ? "Setting up..." : "Get Started"}
          </Text>
        </Button>
      </View>
    </SafeAreaView>
  );
}
