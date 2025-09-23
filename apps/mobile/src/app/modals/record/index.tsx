import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/lib/hooks/useAuth";
import { useRouter } from "expo-router";
import { ChevronDown } from "lucide-react-native";
import React from "react";
import { View } from "react-native";

export default function RecordScreen() {
  const { user } = useAuth();
  const router = useRouter();

  return (
    <View testID="trends-screen" className="flex-1 bg-background h-full">
      {/* Close Button - top-left */}
      <View className="absolute top-12 left-4 z-10">
        <Button size="icon" onPress={() => router.back()}>
          <Icon
            as={ChevronDown}
            className="text-primary-foreground"
            size={24}
          />
        </Button>
      </View>

      {/* Main Content */}
      <View className="flex-1 items-center justify-center">
        <Text className="text-2xl font-bold">Record Screen</Text>

        {__DEV__ && (
          <View className="mt-4">
            <Text>Debug Info</Text>
            <Text>Profile ID: {user?.id || "None"}</Text>
            <Text>Profile Username: {user?.email || "None"}</Text>
          </View>
        )}
      </View>
    </View>
  );
}
