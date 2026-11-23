import { type ActivityDisplayModel, activityDisplayModelSchema } from "@repo/core";

export function createActivityDisplay(
  overrides: Partial<ActivityDisplayModel> = {},
): ActivityDisplayModel {
  return activityDisplayModelSchema.parse({
    contractVersion: "activity-display-v1",
    id: "activity-1",
    href: "/activities/activity-1",
    owner: { id: "owner-1", username: null, avatarUrl: null },
    time: { startedAt: "2026-05-01T09:00:00.000Z", finishedAt: null },
    activityComposition: { kind: "single", categories: ["run"] },
    title: "Activity",
    notes: null,
    metrics: [],
    visibility: "private",
    engagement: { likes: 0, comments: 0, viewerHasLiked: false },
    capabilities: {
      canLike: true,
      canComment: true,
      canShare: false,
      canEdit: true,
      canDelete: true,
      hasRoute: false,
    },
    ...overrides,
  });
}
