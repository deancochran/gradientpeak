import type { ScheduledWorkout } from "@repo/core/types";

export const getPlannedActivities = async (filters: {
  month: number;
  year: number;
}): Promise<ScheduledWorkout[]> => {
  const params = new URLSearchParams(filters as any).toString();
  const response = await fetch(`/api/mobile/activities/planned?${params}`);
  if (!response.ok) {
    const errorBody = await response.text();
    console.error("API Error:", errorBody);
    throw new Error(
      `Failed to fetch planned activities: ${response.statusText}`,
    );
  }
  return response.json();
};

export const getPlannedActivitiesByDate = async (filters: {
  date: string;
}): Promise<any[]> => {
  // Mock data for now - this will be replaced with actual API call
  const mockActivities = [
    {
      id: "1",
      date: new Date().toISOString().split("T")[0],
      type: "INTERVAL",
      sport: "RIDE",
      name: "Threshold Intervals",
      duration: 3600,
      description: "5x8min @ FTP with 3min recovery",
      completed: false,
      targetTSS: 95,
    },
    {
      id: "2",
      date: new Date(Date.now() + 86400000).toISOString().split("T")[0],
      type: "RECOVERY",
      sport: "RUN",
      name: "Recovery Run",
      duration: 2400,
      description: "Easy pace for 40min",
      completed: false,
      targetTSS: 35,
    },
    {
      id: "3",
      date: new Date(Date.now() + 2 * 86400000).toISOString().split("T")[0],
      type: "ENDURANCE",
      sport: "RIDE",
      name: "Long Ride",
      duration: 7200,
      description: "Steady Zone 2 ride",
      completed: false,
      targetTSS: 140,
    },
  ];

  return mockActivities;
};

// Placeholder for the mutation function
export const createCompletedActivity = async (
  newActivityData: any,
): Promise<any> => {
  const response = await fetch("/api/mobile/activities/completed", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(newActivityData),
  });
  if (!response.ok) {
    const errorBody = await response.text();
    console.error("API Error:", errorBody);
    throw new Error(
      `Failed to create completed activity: ${response.statusText}`,
    );
  }
  return response.json();
};
