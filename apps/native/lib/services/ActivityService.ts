import type { ScheduledWorkout } from "@repo/core/types";

export const getPlannedActivities = async (filters: { month: number; year: number }): Promise<ScheduledWorkout[]> => {
  const params = new URLSearchParams(filters as any).toString();
  const response = await fetch(`/api/mobile/activities/planned?${params}`);
  if (!response.ok) {
    const errorBody = await response.text();
    console.error("API Error:", errorBody);
    throw new Error(`Failed to fetch planned activities: ${response.statusText}`);
  }
  return response.json();
};

// Placeholder for the mutation function
export const createCompletedActivity = async (newActivityData: any): Promise<any> => {
    const response = await fetch('/api/mobile/activities/completed', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(newActivityData),
    });
    if (!response.ok) {
        const errorBody = await response.text();
        console.error("API Error:", errorBody);
        throw new Error(`Failed to create completed activity: ${response.statusText}`);
    }
    return response.json();
}
