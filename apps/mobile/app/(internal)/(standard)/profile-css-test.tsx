import type { CssTestObservationInput } from "@repo/core";
import { Text } from "@repo/ui/components/text";
import { Stack } from "expo-router";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { CssTestForm } from "@/components/profile/CssTestForm";
import { api } from "@/lib/api";

export default function ProfileCssTestScreen() {
  const utils = api.useUtils();
  const mutation = api.profileMetrics.recordCssTest.useMutation();

  const recordTest = async (values: CssTestObservationInput) => {
    const result = await mutation.mutateAsync({
      operation_id: values.operationId,
      recorded_at: values.recordedAt,
      time_200_seconds: values.time200Seconds,
      time_400_seconds: values.time400Seconds,
    });
    await utils.profileMetrics.invalidate();
    return result;
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-background"
      testID="profile-css-test-screen"
    >
      <Stack.Screen options={{ title: "CSS test" }} />
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-5 p-4 pb-8"
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-1">
          <Text className="text-xl font-semibold text-foreground">400m / 200m CSS test</Text>
          <Text className="text-sm text-muted-foreground">
            Enter both all-out swim times. This is a dedicated test protocol, not two ordinary
            editable efforts.
          </Text>
        </View>
        <CssTestForm onSubmit={recordTest} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
