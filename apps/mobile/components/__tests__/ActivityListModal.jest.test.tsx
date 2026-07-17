import { Text } from "react-native";
import { renderNative, screen } from "../../test/render-native";
import { ActivityListModal } from "../ActivityListModal";

const useInfiniteQueryMock = jest.fn();

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
}));

jest.mock("@repo/ui/components/empty-state-card", () => ({
  __esModule: true,
  EmptyStateCard: ({ description, title }: { description?: string; title: string }) => (
    <>
      <Text>{title}</Text>
      <Text>{description}</Text>
    </>
  ),
}));

jest.mock("@repo/ui/components/icon", () => ({
  __esModule: true,
  Icon: "Icon",
}));
jest.mock("@repo/ui/components/text", () => {
  const React = require("react");
  return {
    __esModule: true,
    Text: (props: Record<string, unknown>) => React.createElement("Text", props, props.children),
  };
});

jest.mock("@/components/shared/ActivityCard", () => ({
  __esModule: true,
  ActivityCard: ({ activity }: { activity: { name: string } }) => activity.name,
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    activities: {
      listPaginated: {
        useInfiniteQuery: (...args: unknown[]) => useInfiniteQueryMock(...args),
      },
    },
  },
}));

jest.mock("@/lib/hooks/useAuth", () => ({
  __esModule: true,
  useAuth: () => ({
    profile: { username: "runner", avatar_url: null },
    user: { id: "profile-1" },
  }),
}));

describe("ActivityListModal", () => {
  beforeEach(() => {
    useInfiniteQueryMock.mockReturnValue({
      data: {
        pages: [
          {
            items: [
              {
                id: "activity-compatible",
                name: "Tempo Run",
                elapsed_ms: 3_600_000,
                active_ms: 1_800_000,
                derived: { tss: 72, intensity_factor: 0.7 },
              },
              {
                id: "activity-unavailable",
                name: "Imported Walk",
                elapsed_ms: 1_800_000,
                active_ms: 900_000,
                derived: { tss: null, intensity_factor: null },
              },
            ],
            nextCursor: undefined,
          },
        ],
      },
      fetchNextPage: jest.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      isLoading: false,
    });
  });

  it("does not classify missing intensity as recovery", () => {
    renderNative(
      <ActivityListModal
        dateFrom="2026-03-01"
        dateTo="2026-03-31"
        intensityZone="recovery"
        onClose={jest.fn()}
        title="Recovery"
        visible
      />,
    );

    expect(screen.getByText("No Activities Found")).toBeTruthy();
    expect(screen.queryByText("Imported Walk")).toBeNull();
  });

  it("shows activity count and total time when no intensity filter", () => {
    renderNative(
      <ActivityListModal
        dateFrom="2026-03-01"
        dateTo="2026-03-31"
        onClose={jest.fn()}
        title="Activities"
        visible
      />,
    );

    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getAllByText("Activities").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Total TSS")).toBeTruthy();
    expect(screen.getByText("Total Time")).toBeTruthy();
    // active_ms: 1_800_000 + 900_000 = 2_700_000 ms = 45 min
    expect(screen.getByText("45m")).toBeTruthy();
  });
});
