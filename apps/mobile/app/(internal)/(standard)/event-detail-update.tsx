import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { View } from "react-native";
import {
  CreateEventFlow,
  type CreateEventFlowHandle,
} from "@/components/event/create/CreateEventFlow";
import { EmptyState, LoadingState } from "@/components/shared/ScreenState";
import { api } from "@/lib/api";
import { scheduleAwareReadQueryOptions } from "@/lib/api/scheduleQueryOptions";
import { ROUTES } from "@/lib/constants/routes";
import { useDeletedDetailRedirect } from "@/lib/hooks/useDeletedDetailRedirect";

export default function EventDetailUpdateScreen() {
  const router = useRouter();
  const formRef = useRef<CreateEventFlowHandle>(null);
  const { id } = useLocalSearchParams<{ id?: string }>();
  const eventId = typeof id === "string" ? id : "";

  const { isRedirecting, redirectOnNotFound } = useDeletedDetailRedirect({
    onRedirect: () => router.navigate(ROUTES.PLAN.CALENDAR),
  });

  const {
    data: event,
    error,
    isLoading,
  } = api.events.getById.useQuery(
    { id: eventId },
    {
      ...scheduleAwareReadQueryOptions,
      enabled: !!eventId && !isRedirecting,
    },
  );

  useEffect(() => {
    redirectOnNotFound(error);
  }, [error, redirectOnNotFound]);

  if (isLoading || isRedirecting) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <LoadingState message={isRedirecting ? "Closing event..." : "Loading event..."} />
      </View>
    );
  }

  if (!event) {
    return (
      <View className="flex-1 items-center justify-center px-6 bg-background">
        <EmptyState
          actionLabel="Go back"
          description="This event may have been removed."
          onAction={() => router.back()}
          title="Event not found"
        />
      </View>
    );
  }

  if (event.event_type === "imported") {
    return (
      <View className="flex-1 items-center justify-center px-6 bg-background">
        <EmptyState
          actionLabel="Back to event"
          description="Imported events are read-only and cannot be updated here."
          onAction={() => router.replace(ROUTES.PLAN.EVENT_DETAIL(event.id))}
          title="Imported event"
        />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: "Update Event",
          headerRight: () => (
            <Button
              size="sm"
              variant="ghost"
              onPress={() => formRef.current?.submit()}
              testID="event-detail-update-save-button"
            >
              <Text className="text-sm font-semibold text-primary">Save</Text>
            </Button>
          ),
        }}
      />
      <View className="flex-1 p-4">
        <CreateEventFlow
          ref={formRef}
          onCancel={() => router.back()}
          onCreated={() => undefined}
          onUpdated={(updatedEvent) => router.replace(ROUTES.PLAN.EVENT_DETAIL(updatedEvent.id))}
          showFooterActions={false}
          testIDPrefix="event-detail-update"
          updateEvent={event}
        />
      </View>
    </View>
  );
}
