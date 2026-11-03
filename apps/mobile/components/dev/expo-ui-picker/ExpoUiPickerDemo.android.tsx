import {
  Text as ComposeText,
  Host,
  SegmentedButton,
  SingleChoiceSegmentedButtonRow,
} from "@expo/ui/jetpack-compose";
import { Text } from "@repo/ui/components/text";
import { useState } from "react";
import { View } from "react-native";

export function ExpoUiPickerDemo() {
  const [selection, setSelection] = useState("Steady");

  return (
    <View className="gap-4">
      <Text>Jetpack Compose segmented buttons</Text>
      <Host matchContents={{ vertical: true }} style={{ width: "100%" }}>
        <SingleChoiceSegmentedButtonRow>
          {["Easy", "Steady", "Hard"].map((option) => (
            <SegmentedButton
              key={option}
              selected={selection === option}
              onClick={() => setSelection(option)}
            >
              <SegmentedButton.Label>
                <ComposeText>{option}</ComposeText>
              </SegmentedButton.Label>
            </SegmentedButton>
          ))}
        </SingleChoiceSegmentedButtonRow>
      </Host>
      <Text accessibilityLiveRegion="polite">Demo selection: {selection}</Text>
    </View>
  );
}
