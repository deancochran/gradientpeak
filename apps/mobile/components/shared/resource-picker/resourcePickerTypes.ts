export type ResourcePickerScope = "activityPlans" | "routes";

export type ResourcePickerItem = {
  activityCategory?: string | null;
  createdAt?: string | null;
  description?: string | null;
  estimatedDuration?: number | null;
  estimatedTss?: number | null;
  id: string;
  isPublic?: boolean | null;
  isSystem?: boolean | null;
  hasLiked?: boolean | null;
  likesCount?: number | null;
  name: string;
  totalAscent?: number | null;
  totalDistance?: number | null;
  updatedAt?: string | null;
};
