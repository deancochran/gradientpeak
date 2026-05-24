import type {
  CopySeriesActivityPlansToOccurrenceInput,
  CreateOneOffGroupEventInput,
  CreateRecurringEventSeriesInput,
  GroupEventRsvpStatus,
  RsvpEventSeriesInput,
  UpdateEventOccurrenceInput,
  UpdateOneOffGroupEventInput,
} from "@repo/core/groups";
import { api } from "@/lib/api";
import { invalidateGroupEventMutationQueries } from "./invalidation";

export function useGroupEventActions() {
  const utils = api.useUtils();

  const createMutation = api.groups.events.create.useMutation({
    onSuccess: async (data) => {
      await invalidateGroupEventMutationQueries(utils, {
        groupEventId: data.event.id,
        groupId: data.event.group_id,
      });
    },
  });
  const createRecurringEventSeriesMutation =
    api.groups.events.createRecurringEventSeries.useMutation({
      onSuccess: async (data) => {
        await invalidateGroupEventMutationQueries(utils, {
          groupEventId: data.event.id,
          groupId: data.event.group_id,
        });
      },
    });
  const updateMutation = api.groups.events.update.useMutation({
    onSuccess: async (data) => {
      await invalidateGroupEventMutationQueries(utils, {
        groupEventId: data.event.id,
        groupId: data.event.group_id,
      });
    },
  });
  const updateEventOccurrenceMutation = api.groups.events.updateEventOccurrence.useMutation({
    onSuccess: async (data) => {
      await invalidateGroupEventMutationQueries(utils, {
        groupEventId: data.event.id,
        groupId: data.event.group_id,
      });
      if (data.event.series_id) {
        await utils.groups.events.detail.invalidate({ groupEventId: data.event.series_id });
      }
    },
  });
  const copySeriesActivityPlansToOccurrenceMutation =
    api.groups.events.copySeriesActivityPlansToOccurrence.useMutation({
      onSuccess: async (_data, variables) => {
        await Promise.all([
          utils.groups.events.detail.invalidate({ groupEventId: variables.groupEventSeriesId }),
          utils.groups.events.detail.invalidate({ groupEventId: variables.groupEventOccurrenceId }),
          utils.groups.events.seriesOccurrences.invalidate(),
          utils.groups.events.list.invalidate(),
          utils.groups.events.myCalendarGroupEvents.invalidate(),
          utils.groups.events.myUpcomingGroupEvents.invalidate(),
          utils.groups.events.currentEventPlanOptions.invalidate(),
        ]);
      },
    });
  const cancelMutation = api.groups.events.cancel.useMutation({
    onSuccess: async (data) => {
      await invalidateGroupEventMutationQueries(utils, {
        groupEventId: data.event.id,
        groupId: data.event.group_id,
      });
    },
  });
  const rsvpMutation = api.groups.events.rsvp.useMutation({
    onSuccess: async (data) => {
      await invalidateGroupEventMutationQueries(utils, {
        groupEventId: data.event.id,
        groupId: data.event.group_id,
      });
    },
  });
  const rsvpEventSeriesMutation = api.groups.events.rsvpEventSeries.useMutation({
    onSuccess: async (data) => {
      await invalidateGroupEventMutationQueries(utils, {
        groupEventId: data.event.id,
        groupId: data.event.group_id,
      });
    },
  });

  return {
    cancelEvent: (groupEventId: string, scope: "single" | "series" = "single") =>
      cancelMutation.mutateAsync({ groupEventId, scope }),
    createEvent: (input: CreateOneOffGroupEventInput) => createMutation.mutateAsync(input),
    createRecurringEventSeries: (input: CreateRecurringEventSeriesInput) =>
      createRecurringEventSeriesMutation.mutateAsync(input),
    copySeriesActivityPlansToOccurrence: (input: CopySeriesActivityPlansToOccurrenceInput) =>
      copySeriesActivityPlansToOccurrenceMutation.mutateAsync(input),
    rsvp: (
      groupEventId: string,
      status: GroupEventRsvpStatus | null,
      selectedGroupEventActivityPlanId?: string | null,
    ) => rsvpMutation.mutateAsync({ groupEventId, status, selectedGroupEventActivityPlanId }),
    rsvpEventSeries: (input: RsvpEventSeriesInput) => rsvpEventSeriesMutation.mutateAsync(input),
    updateEvent: (input: UpdateOneOffGroupEventInput) => updateMutation.mutateAsync(input),
    updateEventOccurrence: (input: UpdateEventOccurrenceInput) =>
      updateEventOccurrenceMutation.mutateAsync(input),
    cancelMutation,
    createMutation,
    createRecurringEventSeriesMutation,
    copySeriesActivityPlansToOccurrenceMutation,
    rsvpMutation,
    rsvpEventSeriesMutation,
    updateMutation,
    updateEventOccurrenceMutation,
  };
}
