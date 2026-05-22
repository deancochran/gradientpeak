import type {
  CreateOneOffGroupEventInput,
  CreateRecurringEventSeriesInput,
} from "@repo/core/groups";
import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useRef } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { GroupEventForm, type GroupEventFormHandle } from "@/components/groups";
import { useGroupEventActions } from "@/lib/groups";

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

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-background"
      keyboardVerticalOffset={80}
    >
      <Stack.Screen
        options={{
          headerRight: () => (
            <Button
              disabled={isSubmitting}
              onPress={() => formRef.current?.submit()}
              size="sm"
              variant="ghost"
            >
              <Text className="text-sm font-semibold text-primary">
                {isSubmitting ? "Creating..." : "Create"}
              </Text>
            </Button>
          ),
        }}
      />
      <ScrollView contentContainerClassName="gap-5 p-4 pb-8" keyboardShouldPersistTaps="handled">
        <GroupEventForm
          ref={formRef}
          groupId={groupId}
          isSubmitting={isSubmitting}
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
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
