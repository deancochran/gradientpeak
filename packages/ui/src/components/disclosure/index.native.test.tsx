import { useState } from "react";
import { Text } from "react-native";
import { fireEvent, renderNative, screen } from "../../test/render-native";
import { Disclosure } from "./index.native";

function ControlledDisclosure() {
  const [open, setOpen] = useState(false);
  return (
    <Disclosure label="Optional details" open={open} onOpenChange={setOpen} testId="details">
      <Text>Visible detail</Text>
    </Disclosure>
  );
}

describe("Disclosure native", () => {
  it("keeps hidden content out of the tree and exposes expanded state", async () => {
    await renderNative(<ControlledDisclosure />);
    const trigger = screen.getByText("Optional details");
    expect(screen.queryByText("Visible detail")).toBeNull();
    await fireEvent.press(trigger);
    expect(screen.getByText("Visible detail")).toBeTruthy();
    expect(screen.getByTestId("details")).toBeTruthy();
  });
});
