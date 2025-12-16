import { Text } from "@/components/ui/text";
import { ChevronDown, ChevronRight, LucideIcon } from "lucide-react-native";
import React, { useState } from "react";
import { Pressable, View } from "react-native";

interface CollapsibleSectionProps {
  title: string;
  icon: LucideIcon;
  iconColor?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function CollapsibleSection({
  title,
  icon: Icon,
  iconColor = "text-blue-500",
  defaultOpen = true,
  children,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <View className="mb-4">
      <Pressable
        onPress={() => setIsOpen(!isOpen)}
        className="flex-row items-center justify-between p-4 bg-card rounded-lg border border-border active:opacity-70"
      >
        <View className="flex-row items-center gap-3">
          <Icon size={24} className={iconColor} />
          <Text className="text-lg font-semibold text-foreground">{title}</Text>
        </View>
        {isOpen ? (
          <ChevronDown size={20} className="text-muted-foreground" />
        ) : (
          <ChevronRight size={20} className="text-muted-foreground" />
        )}
      </Pressable>

      {isOpen && <View className="mt-3">{children}</View>}
    </View>
  );
}
