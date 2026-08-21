import type { ReactNode } from "react";
import { createHost } from "../../test/mock-components";
import { renderNative, screen } from "../../test/render-native";

jest.mock("@rn-primitives/portal", () => ({
  __esModule: true,
  Portal: ({ children }: { children: ReactNode }) => children,
}));
jest.mock("./AppBottomSheet", () => ({
  __esModule: true,
  AppBottomSheet: createHost("AppBottomSheet"),
}));

const PointInTimeDetailsSheet = require("./PointInTimeDetailsSheet").PointInTimeDetailsSheet;

describe("PointInTimeDetailsSheet", () => {
  it("opens expanded with body scrolling prioritized over sheet dragging", () => {
    renderNative(
      <PointInTimeDetailsSheet
        onClose={jest.fn()}
        portalName="test-sheet"
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
