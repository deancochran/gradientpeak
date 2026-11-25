import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { createHost } from "../../test/mock-components";
import { fireEvent, renderNative, screen, waitFor } from "../../test/render-native";

const query = jest.fn();
const grant = jest.fn();
const revoke = jest.fn();
let actorId: string | null = "athlete-a";

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    useUtils: () => ({
      client: {
        coachingPublication: {
          grant: { mutate: grant },
          permissionOptions: { query },
          revoke: { mutate: revoke },
        },
      },
    }),
  },
}));
jest.mock("@/lib/stores/auth-store", () => ({
  __esModule: true,
  useAuthStore: Object.assign(
    (selector: (state: { user: { id: string } | null }) => unknown) =>
      selector({ user: actorId ? { id: actorId } : null }),
    { getState: () => ({ user: actorId ? { id: actorId } : null }) },
  ),
}));
jest.mock("@repo/ui/components/switch", () => ({
  __esModule: true,
  Switch: ({
    onCheckedChange,
    testId,
    ...props
  }: {
    onCheckedChange: (value: boolean) => void;
    testId?: string;
  }) => React.createElement("Switch", { ...props, onValueChange: onCheckedChange, testID: testId }),
}));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));

const { CoachingPublicationPermissions } = require("./CoachingPublicationPermissions");
const option = {
  coach: { membershipId: "coach-membership", name: "Taylor Coach" },
  currentGrant: null,
  organization: { id: "organization", name: "Summit Club" },
};

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderNative(
    <QueryClientProvider client={client}>
      <CoachingPublicationPermissions />
    </QueryClientProvider>,
  );
}

describe("CoachingPublicationPermissions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    actorId = "athlete-a";
    query.mockResolvedValue({ options: [option] });
  });

  it("uses an actor-scoped authoritative read and grants the selected assigned coach", async () => {
    await renderScreen();
    await waitFor(() =>
      expect(screen.getByTestId("coaching-permission-coach-membership")).toBeTruthy(),
    );

    await fireEvent(
      screen.getByTestId("coaching-permission-coach-membership"),
      "valueChange",
      true,
    );

    await waitFor(() =>
      expect(grant).toHaveBeenCalledWith({
        coachMembershipId: "coach-membership",
        organizationId: "organization",
      }),
    );
    expect(query).toHaveBeenCalled();
  });

  it("shows the normal empty state for athletes without currently assigned coaches", async () => {
    query.mockResolvedValueOnce({ options: [] });
    await renderScreen();

    await waitFor(() =>
      expect(
        screen.getByText(
          "You do not have any currently assigned coaches who can receive this permission.",
        ),
      ).toBeTruthy(),
    );
  });
});
