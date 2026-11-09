import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { CreateEventFlow } from "@/components/event/create/CreateEventFlow";
import { FormScreen } from "@/components/shared/FormScreen";
import { EmptyState, LoadingState } from "@/components/shared/ScreenState";
import { api } from "@/lib/api";
import { scheduleAwareReadQueryOptions } from "@/lib/api/scheduleQueryOptions";
import { ROUTES } from "@/lib/constants/routes";
import { useDeletedDetailRedirect } from "@/lib/hooks/useDeletedDetailRedirect";
import { useDirtyNavigationGuard } from "@/lib/hooks/useDirtyNavigationGuard";

export default function EventDetailUpdateScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const eventId = typeof id === "string" ? id : "";
  const [isDirty, setIsDirty] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const { allowNavigationAfterSuccess } = useDirtyNavigationGuard({ isDirty, isPending });

  const { isRedirecting, redirectOnNotFound } = useDeletedDetailRedirect({
    onRedirect: () => router.dismissTo(ROUTES.PLAN.CALENDAR),
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
    redirectOnNotFound(error?.data?.code === "NOT_FOUND" ? { data: { code: "NOT_FOUND" } } : null);
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

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: "Update Event",
        }}
      />
      <FormScreen testID="event-detail-update-scroll">
        <CreateEventFlow
          onCancel={() => router.back()}
          onCreated={() => undefined}
          onDirtyChange={setIsDirty}
          onPendingChange={setIsPending}
          onUpdated={(updatedEvent) => {
            allowNavigationAfterSuccess();
            router.replace(ROUTES.PLAN.EVENT_DETAIL(updatedEvent.id));
          }}
          testIDPrefix="event-detail-update"
          updateEvent={event}
        />
      </FormScreen>
    </View>
  );
}
