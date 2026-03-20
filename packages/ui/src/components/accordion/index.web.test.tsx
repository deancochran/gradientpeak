import { describe, expect, it } from "vitest";

import { renderWeb, screen } from "../../test/render-web";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./index.web";

describe("Accordion web", () => {
  it("maps normalized test props onto accordion items", () => {
    renderWeb(
      <Accordion collapsible defaultValue="profile" type="single">
        <AccordionItem testId="settings-section" value="profile">
          <AccordionTrigger>Profile</AccordionTrigger>
          <AccordionContent>Profile content</AccordionContent>
        </AccordionItem>
      </Accordion>,
    );

    expect(screen.getByTestId("settings-section")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Profile" })).toBeInTheDocument();
    expect(screen.getByText("Profile content")).toBeInTheDocument();
  });
});
