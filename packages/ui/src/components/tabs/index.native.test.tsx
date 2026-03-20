import * as React from "react";

jest.mock("@rn-primitives/slot", () => {
  return {
    Text: (props: any) =>
      React.createElement("Slot.Text", props, props.children),
  };
});

jest.mock("@rn-primitives/tabs", () => {
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
import { tabsFixtures } from "./fixtures";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./index.native";

describe("Tabs native", () => {
  it("maps normalized test props for root, trigger, and active content", () => {
    const fixture = tabsFixtures.settings;

    const { getByTestId } = renderNative(
      <Tabs
        onValueChange={() => {}}
        testId={fixture.rootTestId}
        value={fixture.values.profile}
      >
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

    const trigger = getByTestId(fixture.triggers.profile.testId);
    const content = getByTestId(fixture.contentTestIds.profile);

    expect(getByTestId(fixture.rootTestId)).toBeTruthy();
    expect(trigger.props.children).toBe(fixture.triggers.profile.label);
    expect(content.props.children).toBe(fixture.content.profile);
  });
});
