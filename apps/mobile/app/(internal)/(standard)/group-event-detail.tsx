import { useLocalSearchParams, useRouter } from "expo-router";
import { Alert } from "react-native";
import { GroupEventDetailScreen } from "@/components/groups";
import {
  DetailOverflowMenu,
  type DetailOverflowMenuAction,
  DetailScaffold,
} from "@/components/shared/detail";
import {
  useGroupDetailViewModel,
  useGroupEventActions,
  useGroupEventDetailViewModel,
} from "@/lib/groups";

function singleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function GroupEventDetailRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ groupEventId?: string }>();
  const groupEventId = singleParam(params.groupEventId);
  const detailVm = useGroupEventDetailViewModel(groupEventId);
  const groupVm = useGroupDetailViewModel(
    detailVm.event ? { groupId: detailVm.event.group_id } : { groupId: null },
  );
  const actions = useGroupEventActions();
  const event = detailVm.event;
  const isWorking =
    actions.cancelMutation.isPending ||
    actions.copySeriesActivityPlansToOccurrenceMutation.isPending ||
    actions.rsvpMutation.isPending ||
    actions.rsvpEventSeriesMutation.isPending;

  const managementActions: DetailOverflowMenuAction[] = [];
  if (event && groupVm.viewer?.canCreateGroupEvent) {
    managementActions.push({
      label: "Edit event",
      onPress: () =>
        router.push({ pathname: "/group-event-edit", params: { groupEventId: event.id } }),
      testID: "group-event-detail-edit",
    });

    if (event.is_recurring_occurrence && event.series_id) {
      managementActions.push({
        label: "Copy series plans",
        onPress: async () => {
          try {
            await actions.copySeriesActivityPlansToOccurrence({
              groupEventOccurrenceId: event.id,
              groupEventSeriesId: event.series_id as string,
            });
            await detailVm.refetch();
          } catch (error) {
            Alert.alert(
              "Unable to copy plans",
              error instanceof Error ? error.message : "Please try again.",
            );
          }
        },
        testID: "group-event-detail-copy-series-plans",
      });
    }

    if (!event.cancelled_at) {
      managementActions.push({
        label: "Cancel event",
        onPress: () => {
          const cancelWithScope = async (scope: "single" | "series") => {
            try {
              await actions.cancelEvent(event.id, scope);
              await detailVm.refetch();
            } catch (error) {
              Alert.alert(
                "Unable to cancel event",
                error instanceof Error ? error.message : "Please try again.",
              );
            }
          };

          if (event.is_recurring_occurrence || event.is_recurring_series) {
            Alert.alert(
              "Cancel recurring event",
              "Choose whether to cancel only this event or the full series.",
              [
                { text: "Keep event", style: "cancel" },
                { text: "This event only", onPress: () => void cancelWithScope("single") },
                {
                  text: "Entire series",
                  style: "destructive",
                  onPress: () => void cancelWithScope("series"),
                },
              ],
            );
            return;
          }

          Alert.alert("Cancel event", "Members will see this event as cancelled.", [
            { text: "Keep event", style: "cancel" },
            {
              text: "Cancel event",
              style: "destructive",
              onPress: () => void cancelWithScope("single"),
            },
          ]);
        },
        testID: "group-event-detail-cancel",
        variant: "destructive",
      });
    }
  }

  return (
    <DetailScaffold
      headerRight={
        managementActions.length > 0
          ? () => (
              <DetailOverflowMenu
                actions={managementActions}
                testID="group-event-detail-overflow"
              />
            )
          : undefined
      }
      isLoading={detailVm.isLoading}
      loadingLabel="Loading group event..."
      notFound={detailVm.isError || !event}
      notFoundDescription="This group event may be unavailable."
      notFoundTitle="Unable to load event"
      screenTestID="group-event-detail-screen"
    >
      {event ? (
        <GroupEventDetailScreen
          canManage={false}
          event={event}
          futureOccurrences={detailVm.seriesOccurrences}
          isLoadingFutureOccurrences={detailVm.seriesOccurrencesQuery.isLoading}
          isWorking={isWorking}
          onActivityPlanPress={(activityPlanId) =>
            router.push({ pathname: "/activity-plan-detail", params: { id: activityPlanId } })
          }
          onOccurrencePress={(occurrence) =>
            router.push({
              pathname: "/group-event-detail",
              params: { groupEventId: occurrence.id },
            })
          }
          onRsvp={async (status, selectedGroupEventActivityPlanId) => {
            try {
              await actions.rsvp(event.id, status, selectedGroupEventActivityPlanId);
            } catch (error) {
              Alert.alert(
                "Unable to RSVP",
                error instanceof Error ? error.message : "Please try again.",
              );
            }
          }}
          onRsvpSeries={async (status) => {
            const groupEventSeriesId =
              event.series_id ?? (event.is_recurring_series ? event.id : null);
            if (!groupEventSeriesId) return;
            try {
              await actions.rsvpEventSeries({ groupEventSeriesId, status });
              await detailVm.refetch();
            } catch (error) {
              Alert.alert(
                "Unable to RSVP to series",
                error instanceof Error ? error.message : "Please try again.",
              );
            }
          }}
        />
      ) : null}
    </DetailScaffold>
  );
}
