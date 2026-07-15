import { Text } from "@repo/ui/components/text";
import { render } from "@testing-library/react-native";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { AppFormModal } from "../AppFormModal";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 34, left: 0, right: 0, top: 0 }),
}));

describe("AppFormModal", () => {
  it("keeps footer actions above the bottom safe area and enables keyboard avoidance", () => {
    const { UNSAFE_getAllByType, UNSAFE_getByType } = render(
      <AppFormModal
        footerContent={<Text>Save actions</Text>}
        onClose={jest.fn()}
        title="Edit details"
      >
        <Text>Form content</Text>
      </AppFormModal>,
    );

    expect(UNSAFE_getByType(KeyboardAvoidingView).props.behavior).toBe(
      Platform.OS === "ios" ? "padding" : "height",
    );

    const footer = UNSAFE_getAllByType(View).find((view) => view.props.style?.paddingBottom === 50);
    expect(footer).toBeTruthy();
  });

  it("adds bottom safe-area clearance to content when no footer is rendered", () => {
    const callerStyle = { paddingTop: 8 };
    const { UNSAFE_getByType } = render(
      <AppFormModal
        onClose={jest.fn()}
        scrollProps={{ contentContainerStyle: callerStyle }}
        title="Read details"
      >
        <View />
      </AppFormModal>,
    );

    expect(UNSAFE_getByType(ScrollView).props.contentContainerStyle).toEqual([
      { paddingBottom: 50 },
      callerStyle,
    ]);
  });
});
