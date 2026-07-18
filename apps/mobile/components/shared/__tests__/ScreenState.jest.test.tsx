import { render } from "@testing-library/react-native";
import { LoadingState } from "../ScreenState";

describe("LoadingState", () => {
  it("announces one busy live-region status with the visible message", () => {
    const { getByRole, getByText } = render(
      <LoadingState message="Loading training plans..." testID="plans-loading" />,
    );

    const status = getByRole("progressbar", { name: "Loading training plans..." });
    expect(status.props.accessibilityLiveRegion).toBe("polite");
    expect(status.props.accessibilityState).toMatchObject({ busy: true });
    expect(getByText("Loading training plans...")).toBeTruthy();
  });
});
