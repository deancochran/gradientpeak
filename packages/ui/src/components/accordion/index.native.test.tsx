import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => import("../../test/react-native"));

import { renderNative } from "../../test/render-native";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./index.native";

describe("Accordion native", () => {
  it("maps normalized test props onto accordion items", () => {
    const { getByTestId, getByText } = renderNative(
      <Accordion type="single" value="profile">
        <AccordionItem testId="settings-section" value="profile">
          <AccordionTrigger>Profile</AccordionTrigger>
          <AccordionContent>Profile content</AccordionContent>
        </AccordionItem>
      </Accordion>,
    );

    expect(getByTestId("settings-section")).toBeTruthy();
    expect(getByText("Profile")).toBeTruthy();
    expect(getByText("Profile content")).toBeTruthy();
  });
});
