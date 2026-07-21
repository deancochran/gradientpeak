import { renderNative } from "../../test/render-native";
import { Text } from "../text/index.native";
import { InlineLoadingStatus, LoadingButton } from "./index.native";

describe("Loading native", () => {
  it("merges busy and disabled state while hiding the decorative spinner", () => {
    const { getByLabelText, queryByRole } = renderNative(
      <LoadingButton
        accessibilityLabel="Saving changes"
        accessibilityState={{ selected: true }}
        loading
      >
        <Text>Save</Text>
      </LoadingButton>,
    );

    const button = getByLabelText("Saving changes");
    expect(button.props.accessibilityState).toEqual({
      busy: true,
      disabled: true,
      selected: true,
    });
    expect(queryByRole("progressbar")).toBeNull();
  });

  it("exposes one labeled busy status and hides its decorative spinner", () => {
    const { getAllByRole, getByLabelText } = renderNative(
      <InlineLoadingStatus label="Loading activities..." />,
    );

    const status = getByLabelText("Loading activities...");
    expect(status.props.accessibilityState).toEqual({ busy: true });
    expect(status.props.accessibilityLiveRegion).toBe("polite");
    expect(getAllByRole("progressbar")).toHaveLength(1);
  });

  it("keeps loading labels aligned with the button variant", () => {
    const { getByText } = renderNative(
      <LoadingButton loading loadingLabel="Saving" variant="outline">
        Save
      </LoadingButton>,
    );

    expect(getByText("Saving").props.className).not.toContain("text-primary-foreground");
  });
});
