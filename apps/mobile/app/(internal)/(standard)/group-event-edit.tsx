import type { UpdateEventOccurrenceInput, UpdateOneOffGroupEventInput } from "@repo/core/groups";
import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useRef } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { GroupEventForm, type GroupEventFormHandle, GroupListSkeleton } from "@/components/groups";
import { useGroupEventActions, useGroupEventDetailViewModel } from "@/lib/groups";

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
                {isSubmitting ? "Saving..." : "Save"}
              </Text>
            </Button>
          ),
        }}
      />
      <ScrollView contentContainerClassName="gap-5 p-4 pb-8" keyboardShouldPersistTaps="handled">
        <GroupEventForm
          ref={formRef}
          event={event}
          groupId={event.group_id}
          isSubmitting={isSubmitting}
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
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
