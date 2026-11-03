import type { UpdateEventOccurrenceInput, UpdateOneOffGroupEventInput } from "@repo/core/groups";
import { LoadingButton } from "@repo/ui/components/loading";
import { Text } from "@repo/ui/components/text";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Alert, View } from "react-native";
import { GroupEventForm, type GroupEventFormHandle, GroupListSkeleton } from "@/components/groups";
import { FormScreen } from "@/components/shared/FormScreen";
import { useGroupEventActions, useGroupEventDetailViewModel } from "@/lib/groups";
import { useDirtyNavigationGuard } from "@/lib/hooks/useDirtyNavigationGuard";

function singleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function GroupEventEditRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ groupEventId?: string }>();
  const groupEventId = singleParam(params.groupEventId);
  const detailVm = useGroupEventDetailViewModel(groupEventId);
  const actions = useGroupEventActions();
  const event = detailVm.event;
  const formRef = useRef<GroupEventFormHandle>(null);
  const isSubmitting =
    actions.updateMutation.isPending || actions.updateEventOccurrenceMutation.isPending;
  const [isDirty, setIsDirty] = useState(false);
  const { allowNavigationAfterSuccess } = useDirtyNavigationGuard({
    isDirty,
    isPending: isSubmitting,
  });

  if (detailVm.isLoading) return <GroupListSkeleton count={3} />;

  if (detailVm.isError || !event) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-6">
        <Text className="text-center text-lg font-semibold text-destructive">
          Unable to load event
        </Text>
        <Text className="mt-2 text-center text-sm text-muted-foreground">
          This group event may be unavailable.
        </Text>
      </View>
    );
  }

  if (event.is_recurring_series) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-6">
        <Text className="text-center text-lg font-semibold text-foreground">
          Series editing is unavailable
        </Text>
        <Text className="mt-2 text-center text-sm text-muted-foreground">
          Edit an individual occurrence instead.
        </Text>
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
      <GroupEventForm
        ref={formRef}
        event={event}
        groupId={event.group_id}
        isSubmitting={isSubmitting}
        onDirtyChange={setIsDirty}
        onSubmit={async (values) => {
          try {
            const result = event.is_recurring_occurrence
              ? await actions.updateEventOccurrence({
                  ...(values as UpdateEventOccurrenceInput),
                  groupEventId: event.id,
                })
              : await actions.updateEvent({
                  ...(values as UpdateOneOffGroupEventInput),
                  groupEventId: event.id,
                });
            allowNavigationAfterSuccess();
            if (result.event === undefined) {
              throw new Error("Event update completed without an event to open.");
            }
            router.replace({
              pathname: "/group-event-detail",
              params: { groupEventId: result.event.id },
            });
          } catch (error) {
            Alert.alert(
              "Unable to update event",
              error instanceof Error ? error.message : "Please try again.",
            );
          }
        }}
        showFooterActions={false}
        submitLabel="Save event"
      />
    </FormScreen>
  );
}
