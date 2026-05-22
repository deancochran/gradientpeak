export type ResourcePickerScope = "activityPlans" | "routes";

export type ResourcePickerItem = {
  activityCategory?: string | null;
  description?: string | null;
  estimatedDuration?: number | null;
  estimatedTss?: number | null;
  id: string;
  isPublic?: boolean | null;
  isSystem?: boolean | null;
  name: string;
  totalAscent?: number | null;
  totalDistance?: number | null;
};
