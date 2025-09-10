import {
  createCompletedActivity,
  getPlannedActivities,
} from "@lib/services/ActivityService";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export const activityKeys = {
  all: ["activities"] as const,
  lists: () => [...activityKeys.all, "list"] as const,
  list: (filters: object) => [...activityKeys.lists(), filters] as const,
};

export const usePlannedActivities = (filters: {
  month: number;
  year: number;
}) => {
  return useQuery({
    queryKey: activityKeys.list(filters),
    queryFn: () => getPlannedActivities(filters),
  });
};

export const useCreateCompletedActivity = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createCompletedActivity, // (newActivityData) => Promise<Activity>
    onSuccess: () => {
      // When a new activity is created, invalidate all activity lists.
      // This will cause any component using usePlannedActivities to automatically refetch.
      queryClient.invalidateQueries({ queryKey: activityKeys.lists() });
    },
    onError: (error) => {
      // In a real app, you'd likely show a toast or other notification
      console.error("Failed to create activity", error);
    },
  });
};
