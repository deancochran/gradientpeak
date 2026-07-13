import type {
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
    rsvp: (groupEventId: string, status: GroupEventRsvpStatus | null) =>
      rsvpMutation.mutateAsync({ groupEventId, status }),
    rsvpEventSeries: (input: RsvpEventSeriesInput) => rsvpEventSeriesMutation.mutateAsync(input),
    updateEvent: (input: UpdateOneOffGroupEventInput) => updateMutation.mutateAsync(input),
    updateEventOccurrence: (input: UpdateEventOccurrenceInput) =>
      updateEventOccurrenceMutation.mutateAsync(input),
    cancelMutation,
    createMutation,
    createRecurringEventSeriesMutation,
    rsvpMutation,
    rsvpEventSeriesMutation,
    updateMutation,
    updateEventOccurrenceMutation,
  };
}
