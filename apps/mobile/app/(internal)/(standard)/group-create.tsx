import { LoadingButton } from "@repo/ui/components/loading";
import { Text } from "@repo/ui/components/text";
import { Stack, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Alert } from "react-native";
import { GroupForm, type GroupFormHandle } from "@/components/groups";
import { FormScreen } from "@/components/shared/FormScreen";
import { useGroupActions } from "@/lib/groups";
import { useDirtyNavigationGuard } from "@/lib/hooks/useDirtyNavigationGuard";

export default function GroupCreateScreen() {
  const router = useRouter();
  const groupActions = useGroupActions();
  const formRef = useRef<GroupFormHandle>(null);
  const isSubmitting = groupActions.createMutation.isPending;
  const [isDirty, setIsDirty] = useState(false);
  const { allowNavigationAfterSuccess } = useDirtyNavigationGuard({
    isDirty,
    isPending: isSubmitting,
  });

  return (
    <FormScreen>
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
      <GroupForm
        ref={formRef}
        isSubmitting={isSubmitting}
        onDirtyChange={setIsDirty}
        onSubmit={async (values) => {
          try {
            const result = await groupActions.createGroup(values);
            allowNavigationAfterSuccess();
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
    </FormScreen>
  );
}
