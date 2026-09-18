import type {
  CreateOneOffGroupEventInput,
  CreateRecurringEventSeriesInput,
} from "@repo/core/groups";
import { LoadingButton } from "@repo/ui/components/loading";
import { Text } from "@repo/ui/components/text";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Alert } from "react-native";
import { GroupEventForm, type GroupEventFormHandle } from "@/components/groups";
import { FormScreen } from "@/components/shared/FormScreen";
import { useGroupEventActions } from "@/lib/groups";
import { useDirtyNavigationGuard } from "@/lib/hooks/useDirtyNavigationGuard";

function singleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function GroupEventCreateRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ groupId?: string }>();
  const groupId = singleParam(params.groupId) ?? "";
  const actions = useGroupEventActions();
  const formRef = useRef<GroupEventFormHandle>(null);
  const isSubmitting =
    actions.createMutation.isPending || actions.createRecurringEventSeriesMutation.isPending;
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
      <GroupEventForm
        ref={formRef}
        groupId={groupId}
        isSubmitting={isSubmitting}
        onDirtyChange={setIsDirty}
        onSubmit={async (values) => {
          try {
            const result =
              "recurrenceRule" in values
                ? await actions.createRecurringEventSeries({
                    ...(values as CreateRecurringEventSeriesInput),
                    groupId,
                  })
                : await actions.createEvent({
                    ...(values as CreateOneOffGroupEventInput),
                    groupId,
                  });
            allowNavigationAfterSuccess();
            router.replace({
              pathname: "/group-event-detail",
              params: { groupEventId: result.event.id },
            });
          } catch (error) {
            Alert.alert(
              "Unable to create event",
              error instanceof Error ? error.message : "Please try again.",
            );
          }
        }}
        showFooterActions={false}
        submitLabel="Create event"
      />
    </FormScreen>
  );
}
