import { render } from "@testing-library/react-native";
import { DeniedState, ErrorState, LoadingState } from "../ScreenState";

describe("LoadingState", () => {
  it("announces one busy live-region status with the visible message", async () => {
    const { getByRole, getByText } = await render(
      <LoadingState message="Loading training plans..." testID="plans-loading" />,
    );

    const status = getByRole("progressbar", { name: "Loading training plans..." });
    expect(status.props.accessibilityLiveRegion).toBe("polite");
    expect(status.props.accessibilityState).toMatchObject({ busy: true });
    expect(getByText("Loading training plans...")).toBeTruthy();
  });
});

describe("ScreenState", () => {
  it("offers a retry action for a recoverable error", async () => {
    const screen = await render(
      <ErrorState
        actionLabel="Try again"
        description="The organization list could not load."
        onAction={jest.fn()}
      />,
    );

    expect(screen.getByText("Something went wrong")).toBeTruthy();
    expect(screen.getByText("Try again")).toBeTruthy();
  });

  it("keeps denied access distinct from an empty or failed query", async () => {
    const screen = await render(
      <DeniedState
        actionLabel="Choose an organization"
        description="This organization is not available for this session."
        onAction={jest.fn()}
      />,
    );

    expect(screen.getByText("Access unavailable")).toBeTruthy();
    expect(screen.getByText("Choose an organization")).toBeTruthy();
  });
});
