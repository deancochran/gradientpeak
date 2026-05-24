import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { ActivityIndicator, View } from "react-native";
import {
  CreateEventFlow,
  type CreateEventFlowHandle,
} from "@/components/event/create/CreateEventFlow";
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
        <ActivityIndicator size="large" />
        <Text className="text-sm text-muted-foreground mt-3">
          {isRedirecting ? "Closing event..." : "Loading event..."}
        </Text>
      </View>
    );
  }

  if (!event) {
    return (
      <View className="flex-1 items-center justify-center px-6 bg-background">
        <Text className="text-lg font-semibold text-foreground">Event not found</Text>
        <Text className="text-sm text-muted-foreground text-center mt-2">
          This event may have been removed.
        </Text>
        <Button className="mt-4" onPress={() => router.back()}>
          <Text className="text-primary-foreground">Go Back</Text>
        </Button>
      </View>
    );
  }

  if (event.event_type === "imported") {
    return (
      <View className="flex-1 items-center justify-center px-6 bg-background">
        <Text className="text-lg font-semibold text-foreground">Imported event</Text>
        <Text className="mt-2 text-center text-sm text-muted-foreground">
          Imported events are read-only and cannot be updated here.
        </Text>
        <Button className="mt-4" onPress={() => router.replace(ROUTES.PLAN.EVENT_DETAIL(event.id))}>
          <Text className="text-primary-foreground">Back to Event</Text>
        </Button>
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
