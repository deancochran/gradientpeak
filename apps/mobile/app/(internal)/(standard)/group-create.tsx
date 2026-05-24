import { LoadingButton } from "@repo/ui/components/loading";
import { Text } from "@repo/ui/components/text";
import { Stack, useRouter } from "expo-router";
import { useRef } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { GroupForm, type GroupFormHandle } from "@/components/groups";
import { useGroupActions } from "@/lib/groups";

export default function GroupCreateScreen() {
  const router = useRouter();
  const groupActions = useGroupActions();
  const formRef = useRef<GroupFormHandle>(null);
  const isSubmitting = groupActions.createMutation.isPending;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-background"
      keyboardVerticalOffset={80}
    >
      <Stack.Screen
        options={{
          headerRight: () => (
            <LoadingButton
              disabled={isSubmitting}
              loading={isSubmitting}
              loadingLabel="Creating..."
              loadingTextClassName="text-primary"
              onPress={() => formRef.current?.submit()}
              size="sm"
              variant="ghost"
            >
              <Text className="text-sm font-semibold text-primary">Create</Text>
            </LoadingButton>
          ),
        }}
      />
      <ScrollView contentContainerClassName="gap-5 p-4 pb-8" keyboardShouldPersistTaps="handled">
        <GroupForm
          ref={formRef}
          isSubmitting={isSubmitting}
          onSubmit={async (values) => {
            try {
              const result = await groupActions.createGroup(values);
              router.replace({ pathname: "/group-detail", params: { groupId: result.group.id } });
            } catch (error) {
              Alert.alert(
                "Unable to create group",
                error instanceof Error ? error.message : "Please try again.",
              );
            }
          }}
          showFooterActions={false}
          submitLabel="Create group"
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
