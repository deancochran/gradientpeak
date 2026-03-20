import * as React from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => import("../../test/react-native"));
vi.mock("@rn-primitives/slot", () => {
  return {
    Text: (props: any) =>
      React.createElement("Slot.Text", props, props.children),
  };
});

vi.mock("@rn-primitives/tabs", () => {
  const valueContext = React.createContext({
    value: undefined as string | undefined,
  });
  const createHost = (type: string) =>
    function Host(props: any) {
      return React.createElement(type, props, props.children);
    };

  function Root(props: any) {
    return React.createElement(
      valueContext.Provider,
      {
        value: {
          value: props.value as string | undefined,
        },
      },
      React.createElement("TabsRoot", props, props.children),
    );
  }

  function Content(props: any) {
    const context = React.useContext(valueContext);
    if (props.value !== context.value) {
      return null;
    }

    return React.createElement("TabsContent", props, props.children);
  }

  return {
    Content,
    List: createHost("TabsList"),
    Root,
    Trigger: createHost("TabsTrigger"),
    useRootContext: () => React.useContext(valueContext),
  };
});

import { renderNative } from "../../test/render-native";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./index.native";

describe("Tabs native", () => {
  it("maps normalized test props for root, trigger, and active content", () => {
    const { getByTestId } = renderNative(
      <Tabs onValueChange={() => {}} testId="settings-tabs" value="profile">
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

    const trigger = getByTestId("settings-tabs-trigger-profile");
    const content = getByTestId("settings-tabs-content-profile");

    expect(getByTestId("settings-tabs")).toBeTruthy();
    expect(trigger.props.children).toBe("Profile");
    expect(content.props.children).toBe("Profile content");
  });
});
