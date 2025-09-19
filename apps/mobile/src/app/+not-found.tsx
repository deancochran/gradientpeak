// apps/native/app/(external)/not-found.tsx
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { router } from "expo-router";
import { View } from "react-native";

export default function NotFoundScreen() {
  return (
    <View className="flex-1 bg-background justify-center items-center p-4">
      <Text className="text-foreground text-center text-xl mb-4">
        Oops! Page not found.
      </Text>
      <Button
        onPress={() => router.replace("/")}
        className="px-6 py-3 bg-primary rounded"
      >
        <Text className="text-background font-semibold text-center">
          Go Home
        </Text>
      </Button>
    </View>
  );
}
