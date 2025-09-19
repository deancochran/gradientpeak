import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useErrorHandler } from "@/lib/hooks/useErrorHandler";
import { trpc } from "@/lib/trpc";
import * as React from "react";
import { View } from "react-native";

export function ExampleErrorHandling() {
  const { handleError, handleAsyncError } = useErrorHandler();

  // Example query with automatic error handling
  const { data: user, error, isLoading } = trpc.user.getProfile.useQuery();

  // Handle query errors
  React.useEffect(() => {
    if (error) {
      handleError(error, "User Profile Query");
    }
  }, [error, handleError]);

  const handleUpdateProfile = async () => {
    const updateProfile = trpc.user.updateProfile.useMutation();

    await handleAsyncError(async () => {
      await updateProfile.mutateAsync({ name: "New Name" });
      // Success logic here
    }, "Update Profile Mutation");
  };

  if (isLoading) {
    return (
      <View className="p-4">
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <View className="p-4">
      <Text className="text-xl font-semibold mb-4">Welcome, {user?.name}!</Text>

      <Button onPress={handleUpdateProfile} className="mb-4">
        <Text className="text-primary-foreground">Update Profile</Text>
      </Button>

      <Text className="text-sm text-muted-foreground">
        This component demonstrates error handling with: ✅ Automatic query
        error handling ✅ Safe mutation execution ✅ Context-aware error
        messages
      </Text>
    </View>
  );
}

// Export ErrorBoundary for this specific component
export function ErrorBoundary({
  error,
  retry,
}: {
  error: Error;
  retry: () => void;
}) {
  return (
    <View className="p-4 bg-destructive/10 rounded-lg">
      <Text className="text-destructive font-semibold mb-2">
        Component Error
      </Text>
      <Text className="text-sm mb-4">{error.message}</Text>
      <Button onPress={retry} variant="outline" size="sm">
        <Text>Retry Component</Text>
      </Button>
    </View>
  );
}
