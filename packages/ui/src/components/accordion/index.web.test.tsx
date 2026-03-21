import { describe, expect, it } from "vitest";

import { renderWeb, screen } from "../../test/render-web";
import { accordionFixtures } from "./fixtures";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./index.web";

describe("Accordion web", () => {
  it("maps normalized test props onto accordion items", () => {
    renderWeb(
      <Accordion collapsible defaultValue={accordionFixtures.settings.value} type="single">
        <AccordionItem
          testId={accordionFixtures.settings.testId}
          value={accordionFixtures.settings.value}
        >
          <AccordionTrigger>{accordionFixtures.settings.title}</AccordionTrigger>
          <AccordionContent>{accordionFixtures.settings.content}</AccordionContent>
        </AccordionItem>
      </Accordion>,
    );

    expect(screen.getByTestId(accordionFixtures.settings.testId)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: accordionFixtures.settings.title }),
    ).toBeInTheDocument();
    expect(screen.getByText(accordionFixtures.settings.content)).toBeInTheDocument();
  });
});
