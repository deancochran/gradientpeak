import { describe, expect, it } from "vitest";

import { renderWeb, screen } from "../../test/render-web";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./index.web";

describe("Tabs web", () => {
  it("maps normalized test props for root, trigger, and content", () => {
    renderWeb(
      <Tabs defaultValue="profile" testId="settings-tabs">
        <TabsList testId="settings-tabs-list">
          <TabsTrigger testId="settings-tabs-trigger-profile" value="profile">
            Profile
          </TabsTrigger>
        </TabsList>
        <TabsContent testId="settings-tabs-content-profile" value="profile">
          Profile content
        </TabsContent>
      </Tabs>,
    );

    expect(screen.getByTestId("settings-tabs")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Profile" })).toHaveAttribute(
      "data-testid",
      "settings-tabs-trigger-profile",
    );
    expect(
      screen.getByTestId("settings-tabs-content-profile"),
    ).toHaveTextContent("Profile content");
  });
});
