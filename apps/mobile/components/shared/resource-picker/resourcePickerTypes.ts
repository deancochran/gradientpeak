import type { ActivityPlanDetail, ActivityPlanSummary } from "@repo/core";

export type ResourcePickerScope = "activityPlans" | "routes";

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

type ResourcePickerItemBase = {
  activityCategory?: string | null;
  createdAt?: string | null;
  description?: string | null;
  estimatedDuration?: number | null;
  estimatedCommonLoad?: number | null;
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

/** A picker result backed by one of the canonical resource cards. */
export type ResourcePickerCanonicalItem =
  | (ResourcePickerItemBase & {
      activityPlan: ActivityPlanSummary | ActivityPlanDetail;
      presentation: "canonical";
    })
  | (ResourcePickerItemBase & {
      presentation: "canonical";
      routeCardData: ResourcePickerRouteCardData;
    });

/**
 * A compact result from an external/imported source that cannot supply a
 * canonical resource card. Query mappers must use `ResourcePickerCanonicalItem`.
 */
export type ResourcePickerExternalItem = ResourcePickerItemBase & {
  presentation: "external";
};

export type ResourcePickerItem = ResourcePickerCanonicalItem | ResourcePickerExternalItem;
