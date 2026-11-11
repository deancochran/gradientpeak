import { LoadingButton } from "@repo/ui/components/loading";
import { Text } from "@repo/ui/components/text";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Alert, View } from "react-native";
import {
  GroupForm,
  type GroupFormHandle,
  GroupListSkeleton,
  GroupMembersOnlyLockedState,
} from "@/components/groups";
import { FormScreen } from "@/components/shared/FormScreen";
import { useGroupActions, useGroupDetailViewModel } from "@/lib/groups";
import { useDirtyNavigationGuard } from "@/lib/hooks/useDirtyNavigationGuard";

function singleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function GroupEditScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ groupId?: string }>();
  const groupId = singleParam(params.groupId) ?? null;
  const detailVm = useGroupDetailViewModel({ groupId });
  const groupActions = useGroupActions();
  const formRef = useRef<GroupFormHandle>(null);
  const isSubmitting = groupActions.updateMutation.isPending;
  const [isDirty, setIsDirty] = useState(false);
  const { allowNavigationAfterSuccess } = useDirtyNavigationGuard({
    isDirty,
    isPending: isSubmitting,
  });

  if (detailVm.isLoading) {
    return <GroupListSkeleton count={2} />;
  }

  if (detailVm.isError || !detailVm.group) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-6">
        <Text className="text-center text-lg font-semibold text-destructive">
          Unable to load group
        </Text>
        <Text className="mt-2 text-center text-sm text-muted-foreground">
          Pull back and try again.
        </Text>
      </View>
    );
  }

  if (!detailVm.viewer?.canEditGroup) {
    return (
      <View className="flex-1 bg-background p-4">
        <GroupMembersOnlyLockedState />
      </View>
    );
  }

  return (
    <FormScreen>
      <Stack.Screen
        options={{
          headerRight: () => (
            <LoadingButton
              disabled={isSubmitting}
              loading={isSubmitting}
              loadingLabel="Saving..."
              loadingTextClassName="text-primary"
              onPress={() => formRef.current?.submit()}
              size="sm"
              variant="ghost"
            >
              <Text className="text-sm font-semibold text-primary">Save</Text>
            </LoadingButton>
          ),
        }}
      />
      <GroupForm
        ref={formRef}
        group={detailVm.group}
        isSubmitting={isSubmitting}
        onDirtyChange={setIsDirty}
        onSubmit={async (values) => {
          if (!detailVm.group?.id) return;

          try {
            await groupActions.updateGroup({ ...values, groupId: detailVm.group.id });
            allowNavigationAfterSuccess();
            router.replace({
              pathname: "/group-detail",
              params: { groupId: detailVm.group.id },
            });
          } catch (error) {
            Alert.alert(
              "Unable to update group",
              error instanceof Error ? error.message : "Please try again.",
            );
          }
        }}
        showFooterActions={false}
        submitLabel="Save changes"
      />
    </FormScreen>
  );
}
