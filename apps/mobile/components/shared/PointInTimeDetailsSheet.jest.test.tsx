import { createHost } from "../../test/mock-components";
import { renderNative, screen } from "../../test/render-native";

jest.mock("./AppBottomSheet", () => ({
  __esModule: true,
  AppBottomSheet: createHost("AppBottomSheet"),
}));

const PointInTimeDetailsSheet = require("./PointInTimeDetailsSheet").PointInTimeDetailsSheet;

describe("PointInTimeDetailsSheet", () => {
  it("opens expanded with body scrolling prioritized over sheet dragging", async () => {
    await renderNative(
      <PointInTimeDetailsSheet
        onClose={jest.fn()}
        testID="point-in-time-sheet"
        title="Day details"
        visible
      >
        Long content
      </PointInTimeDetailsSheet>,
    );

    expect(screen.getByTestId("point-in-time-sheet").props).toMatchObject({
      contentPanningGestureEnabled: false,
      initialSnapIndex: 1,
      snapPoints: ["88%", "96%"],
    });
  });
});
