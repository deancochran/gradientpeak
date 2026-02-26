import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { ChevronDown, ChevronUp } from "lucide-react-native";
import React from "react";
import { View } from "react-native";

type Props = {
  expanded: boolean;
  value: string;
  usingHostedDefault: boolean;
  onToggle: () => void;
  onChange: (value: string) => void;
};

export function ServerUrlOverride({
  expanded,
  value,
  usingHostedDefault,
  onToggle,
  onChange,
}: Props) {
  return (
    <View className="gap-2" testID="server-url-override">
      <Button
        variant="ghost"
        className="h-9 justify-between px-2"
        onPress={onToggle}
        testID="server-url-toggle"
      >
        <Text className="text-xs text-muted-foreground">
          Server URL ({usingHostedDefault ? "Hosted" : "Custom"})
        </Text>
        {expanded ? (
          <ChevronUp size={14} className="text-muted-foreground" />
        ) : (
          <ChevronDown size={14} className="text-muted-foreground" />
        )}
      </Button>

      {expanded ? (
        <View className="gap-2" testID="server-url-panel">
          <Input
            value={value}
            onChangeText={onChange}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder="https://api.example.com"
            testID="server-url-input"
          />
          <Text className="text-xs text-muted-foreground">
            Leave as hosted URL for default app connectivity.
          </Text>
        </View>
      ) : null}
    </View>
  );
}
