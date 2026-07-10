export type ResourcePickerScope = "activityPlans" | "routes";

export type ResourcePickerActivityPlanCardData = {
  activityType: string;
  createdAt?: string | null;
  description?: string | null;
  estimatedDuration?: number | null;
  estimatedTss?: number | null;
  hasLiked?: boolean | null;
  id: string;
  likesCount?: number | null;
  name: string;
  updatedAt?: string | null;
};

export type ResourcePickerRouteCardData = {
  activity_category?: string | null;
  description?: string | null;
  has_liked?: boolean | null;
  id: string;
  likes_count?: number | null;
  name: string;
  total_ascent?: number | null;
  total_descent?: number | null;
  total_distance?: number | null;
};

export type ResourcePickerItem = {
  activityCategory?: string | null;
  activityPlanCardData?: ResourcePickerActivityPlanCardData;
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
  routeCardData?: ResourcePickerRouteCardData;
  totalAscent?: number | null;
  totalDistance?: number | null;
  updatedAt?: string | null;
};
