import { Host, Picker, Text as SwiftUIText } from "@expo/ui/swift-ui";
import { pickerStyle, tag } from "@expo/ui/swift-ui/modifiers";
import { Text } from "@repo/ui/components/text";
import { useState } from "react";
import { View } from "react-native";

export function ExpoUiPickerDemo() {
  const [selection, setSelection] = useState("Steady");

  return (
    <View className="gap-4">
      <Text>SwiftUI segmented picker</Text>
      <Host style={{ width: "100%", height: 64 }}>
        <Picker
          label="Demo effort"
          selection={selection}
          onSelectionChange={setSelection}
          modifiers={[pickerStyle("segmented")]}
        >
          {["Easy", "Steady", "Hard"].map((option) => (
            <SwiftUIText key={option} modifiers={[tag(option)]}>
              {option}
            </SwiftUIText>
          ))}
        </Picker>
      </Host>
      <Text accessibilityLiveRegion="polite">Demo selection: {selection}</Text>
    </View>
  );
}
