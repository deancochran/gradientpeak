import { describe, expect, it } from "vitest";

import { renderWeb, screen } from "../../test/render-web";
import { tabsFixtures } from "./fixtures";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./index.web";

describe("Tabs web", () => {
  it("maps normalized test props for root, trigger, and content", () => {
    const fixture = tabsFixtures.settings;

    renderWeb(
      <Tabs defaultValue={fixture.values.profile} testId={fixture.rootTestId}>
        <TabsList testId={fixture.listTestId}>
          <TabsTrigger
            testId={fixture.triggers.profile.testId}
            value={fixture.values.profile}
          >
            {fixture.triggers.profile.label}
          </TabsTrigger>
        </TabsList>
        <TabsContent
          testId={fixture.contentTestIds.profile}
          value={fixture.values.profile}
        >
          {fixture.content.profile}
        </TabsContent>
      </Tabs>,
    );

    expect(screen.getByTestId(fixture.rootTestId)).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: fixture.triggers.profile.label }),
    ).toHaveAttribute("data-testid", fixture.triggers.profile.testId);
    expect(
      screen.getByTestId(fixture.contentTestIds.profile),
    ).toHaveTextContent(fixture.content.profile);
  });
});
