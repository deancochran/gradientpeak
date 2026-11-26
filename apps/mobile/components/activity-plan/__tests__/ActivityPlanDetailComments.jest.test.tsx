import React from "react";
import { createHost } from "../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../test/render-native";
import { EntityCommentsSheetProvider } from "../../social/EntityCommentsSheetProvider";
import { ActivityPlanDetailScreen } from "../ActivityPlanDetailScreen";

const plan = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Threshold Run",
  activityCategory: "run",
  capabilities: { canDelete: false, canDuplicate: false, canRecord: false, canSchedule: false },
  contractVersion: "activity-plan-detail-v1" as const,
  createdAt: "2026-09-08T00:00:00.000Z",
  description: null,
  engagement: { likes: 0, viewerHasLiked: false },
  metrics: [],
  owner: null,
  structure: null,
  visibility: "public" as const,
};

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  ActivityIndicator: createHost("ActivityIndicator"),
  Pressable: createHost("Pressable"),
  ScrollView: createHost("ScrollView"),
  View: createHost("View"),
}));

jest.mock("expo-router", () => ({
  __esModule: true,
  Stack: { Screen: createHost("StackScreen") },
  useRouter: () => ({ navigate: jest.fn() }),
}));

jest.mock("@tanstack/react-query", () => ({ __esModule: true, useQueryClient: () => ({}) }));
jest.mock("@repo/api/react", () => ({
  __esModule: true,
  invalidateActivityPlanQueries: jest.fn(),
}));
jest.mock("@repo/ui/components/icon", () => ({ __esModule: true, Icon: createHost("Icon") }));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));
jest.mock("lucide-react-native", () => ({
  __esModule: true,
  MessageCircle: createHost("MessageCircle"),
  Share2: createHost("Share2"),
}));
jest.mock("@/components/shared/ActivityPlanSummary", () => ({
  __esModule: true,
  ActivityPlanSummary: createHost("ActivityPlanSummary"),
}));
jest.mock("@/components/shared/detail", () => ({
  __esModule: true,
  DetailDeleteConfirmModal: createHost("DetailDeleteConfirmModal"),
  DetailOverflowMenu: createHost("DetailOverflowMenu"),
}));
jest.mock("@/components/shared/ResourceCardPrimitives", () => ({
  __esModule: true,
  ResourceCardActionButton: ({
    children,
    onPress,
    ...props
  }: {
    children?: React.ReactNode;
    onPress?: () => void;
    [key: string]: unknown;
  }) => React.createElement("Pressable", { ...props, onPress }, children),
  ResourceLikeButton: createHost("ResourceLikeButton"),
  ResourceOwnerActionRow: createHost("ResourceOwnerActionRow"),
}));
jest.mock("@/components/activity-plan/ActivityPlanContentPreview", () => ({
  __esModule: true,
  ActivityPlanContentPreview: createHost("ActivityPlanContentPreview"),
}));
jest.mock("@/components/shared/AppBottomSheet", () => ({
  __esModule: true,
  APP_BOTTOM_SHEET_PRESENTATIONS: { inspector: { initialSnapIndex: 0, snapPoints: ["82%"] } },
  AppBottomSheet: ({
    children,
    visible,
    ...props
  }: {
    children: React.ReactNode;
    visible: boolean;
  }) => (visible ? React.createElement("AppBottomSheet", props, children) : null),
}));
jest.mock("@/components/social/EntityCommentsSection", () => ({
  __esModule: true,
  EntityCommentsSection: (props: Record<string, unknown>) =>
    React.createElement("EntityCommentsSection", { ...props, testID: "entity-comments-section" }),
}));
jest.mock("@/lib/hooks/useEntityCommentsController", () => ({
  __esModule: true,
  useEntityCommentsController: () => ({
    addCommentPending: false,
    commentCount: 0,
    comments: [],
    commentsError: null,
    handleAddComment: jest.fn(),
    hasMoreComments: false,
    isLoadingComments: false,
    isLoadingMoreComments: false,
    loadMoreComments: jest.fn(),
    newComment: "",
    setNewComment: jest.fn(),
  }),
}));
jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    activityPlans: {
      delete: { useMutation: () => ({ isPending: false, mutate: jest.fn() }) },
      getById: { useQuery: () => ({ data: { detail: plan }, isLoading: false }) },
    },
    athleteIntelligence: {
      getReadModel: { useQuery: () => ({ data: undefined, isLoading: false }) },
    },
    events: { getById: { useQuery: () => ({ data: null, isLoading: false }) } },
    social: { toggleLike: { useMutation: () => ({ isPending: false, mutate: jest.fn() }) } },
    useUtils: () => ({}),
  },
}));
jest.mock("@/lib/constants/activities", () => ({
  __esModule: true,
  getUniqueActivityCategoryConfigs: () => [],
}));
jest.mock("@/lib/constants/routes", () => ({
  __esModule: true,
  ROUTES: { PLAN: { CALENDAR: "/" } },
}));
jest.mock("@/lib/hooks/useActivityRecorder", () => ({
  __esModule: true,
  useSessionView: () => null,
}));
jest.mock("@/lib/hooks/useAuth", () => ({ __esModule: true, useAuth: () => ({ profile: null }) }));
jest.mock("@/lib/hooks/useDeletedDetailRedirect", () => ({
  __esModule: true,
  useDeletedDetailRedirect: () => ({
    beginRedirect: jest.fn(),
    isRedirecting: false,
    redirectOnNotFound: jest.fn(),
  }),
}));
jest.mock("@/lib/hooks/useResourceLike", () => ({
  __esModule: true,
  useResourceLike: () => ({
    isLiked: false,
    isPending: false,
    likeCount: 0,
    toggleLike: jest.fn(),
  }),
}));
jest.mock("@/lib/navigation/recordingNavigation", () => ({
  __esModule: true,
  returnToRecordScreen: jest.fn(),
}));
jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => jest.fn(),
}));
jest.mock("@/lib/providers/ActivityRecorderProvider", () => ({
  __esModule: true,
  useOptionalActivityRecorderService: () => null,
}));
jest.mock("@/lib/recording/recordingObjectActions", () => ({
  __esModule: true,
  handleRecordingObjectAction: jest.fn(),
  resolveRecordingObjectAction: () => null,
}));
jest.mock("@/lib/share/public-share-url", () => ({
  __esModule: true,
  getPublicShareUrl: (path: string) => path,
}));
jest.mock("../useActivityPlanDetailViewModel", () => ({
  __esModule: true,
  useActivityPlanDetailViewModel: () => ({ activityPlan: plan, isOwnedByUser: false }),
}));
jest.mock("../useActivityPlanSchedulingActions", () => ({
  __esModule: true,
  useActivityPlanSchedulingActions: () => ({
    duplicatePending: false,
    isScheduled: false,
    primaryScheduleLabel: "Schedule",
    scheduledDate: null,
  }),
}));

describe("ActivityPlanDetailScreen comments", () => {
  it("opens the root-owned activity-plan comments sheet", async () => {
    await renderNative(
      <EntityCommentsSheetProvider>
        <ActivityPlanDetailScreen planId={plan.id} />
      </EntityCommentsSheetProvider>,
    );

    await fireEvent.press(screen.getByTestId("activity-plan-comments-button"));

    expect(screen.getByTestId("entity-comments-sheet")).toBeTruthy();
    expect(screen.getByTestId("entity-comments-section")).toBeTruthy();
  });
});
