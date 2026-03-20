import { renderNative } from "../../test/render-native";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./index.native";

describe("Accordion native", () => {
  it("maps normalized test props onto accordion items", () => {
    const { getByTestId } = renderNative(
      <Accordion type="single" value="profile">
        <AccordionItem testId="settings-section" value="profile">
          <AccordionTrigger testID="settings-trigger">Profile</AccordionTrigger>
          <AccordionContent testID="settings-content">
            Profile content
          </AccordionContent>
        </AccordionItem>
      </Accordion>,
    );

    expect(getByTestId("settings-section")).toBeTruthy();
    expect(getByTestId("settings-trigger")).toBeTruthy();
    expect(getByTestId("settings-content")).toBeTruthy();
  });
});
