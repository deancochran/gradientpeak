import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
import { WizardStep } from "../WizardStep";
import { Calendar } from "lucide-react-native";
import React, { useState } from "react";
import { View, Pressable, Platform } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import type { WizardGoalInput } from "@repo/core";

interface GoalSelectionStepProps {
  goal: WizardGoalInput;
  onGoalChange: (goal: WizardGoalInput) => void;
  onNext: () => void;
  onBack?: () => void;
  currentStep: number;
  totalSteps: number;
}

const COMMON_EVENTS = [
  "Marathon (26.2 mi / 42.2 km)",
  "Half Marathon (13.1 mi / 21.1 km)",
  "10K",
  "5K",
  "Sprint Triathlon",
  "Olympic Triathlon",
  "Half Ironman (70.3)",
  "Ironman",
  "Century Ride (100 mi)",
  "Gran Fondo",
];

export function GoalSelectionStep({
  goal,
  onGoalChange,
  onNext,
  onBack,
  currentStep,
  totalSteps,
}: GoalSelectionStepProps) {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const eventDate = goal.target_date ? new Date(goal.target_date) : new Date();

  // Calculate weeks until event
  const weeksUntil = goal.target_date
    ? Math.ceil(
        (new Date(goal.target_date).getTime() - new Date().getTime()) /
          (7 * 24 * 60 * 60 * 1000),
      )
    : 0;

  const handleDateChange = (event: any, selectedDate?: Date) => {
    // On Android, always hide picker after selection
    if (Platform.OS === "android") {
      setShowDatePicker(false);
    }

    if (selectedDate && event.type !== "dismissed") {
      const dateString = selectedDate.toISOString().split("T")[0] || "";
      onGoalChange({ ...goal, target_date: dateString });
    }

    // On iOS, hide picker after selection
    if (Platform.OS === "ios" && selectedDate) {
      setShowDatePicker(false);
    }
  };

  const handleQuickSelect = (eventName: string) => {
    onGoalChange({ ...goal, name: eventName });
    setShowSuggestions(false);
  };

  const filteredSuggestions = COMMON_EVENTS.filter((event) =>
    event.toLowerCase().includes(goal.name.toLowerCase()),
  );

  const isValid = goal.name.trim().length > 0 && goal.target_date.length > 0;

  return (
    <WizardStep
      currentStep={currentStep}
      totalSteps={totalSteps}
      title="What's your goal?"
      description="Tell us about the event or target you're training for"
      onBack={onBack}
      onNext={onNext}
      nextDisabled={!isValid}
    >
      {/* Event Name Input with Suggestions */}
      <View className="gap-2">
        <Label nativeID="event-name">Event or Goal Name</Label>
        <Input
          placeholder="e.g., Boston Marathon, Sprint Triathlon"
          value={goal.name}
          onChangeText={(text) => {
            onGoalChange({ ...goal, name: text });
            setShowSuggestions(text.length > 0);
          }}
          onFocus={() => setShowSuggestions(goal.name.length > 0)}
          aria-labelledby="event-name"
        />
        <Text className="text-xs text-muted-foreground">
          Enter your race, event, or training objective
        </Text>

        {/* Quick Selection Chips */}
        {!showSuggestions && goal.name.length === 0 && (
          <View className="gap-2 mt-2">
            <Text className="text-sm font-medium text-foreground">
              Popular Events:
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {COMMON_EVENTS.slice(0, 6).map((event) => (
                <Pressable
                  key={event}
                  onPress={() => handleQuickSelect(event)}
                  className="bg-secondary px-3 py-2 rounded-full active:bg-secondary/80"
                >
                  <Text className="text-secondary-foreground text-sm">
                    {event}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Suggestions Dropdown */}
        {showSuggestions && filteredSuggestions.length > 0 && (
          <Card className="mt-1">
            <CardContent className="p-2">
              {filteredSuggestions.map((event) => (
                <Pressable
                  key={event}
                  onPress={() => handleQuickSelect(event)}
                  className="px-3 py-2 rounded active:bg-accent"
                >
                  <Text className="text-foreground">{event}</Text>
                </Pressable>
              ))}
            </CardContent>
          </Card>
        )}
      </View>

      {/* Event Date */}
      <View className="gap-2">
        <Label nativeID="event-date">Event Date</Label>
        <Pressable
          onPress={() => setShowDatePicker(true)}
          className="border border-input bg-background rounded-md px-4 py-3 flex-row items-center justify-between active:bg-accent"
        >
          <Text className="text-foreground">
            {goal.target_date
              ? new Date(goal.target_date).toLocaleDateString("en-US", {
                  weekday: "short",
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })
              : "Select date"}
          </Text>
          <Calendar size={20} className="text-muted-foreground" />
        </Pressable>

        {goal.target_date && (
          <View className="bg-primary/10 rounded-lg p-3 flex-row items-center justify-between">
            <Text className="text-sm text-foreground">Weeks until event:</Text>
            <Text className="text-lg font-bold text-primary">
              {weeksUntil} weeks
            </Text>
          </View>
        )}

        {showDatePicker && (
          <DateTimePicker
            value={eventDate}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={handleDateChange}
            minimumDate={new Date()}
          />
        )}
      </View>

      {/* Validation Warning */}
      {!isValid && (goal.name.trim().length === 0 || weeksUntil < 4) && (
        <Card className="bg-destructive/10 border-destructive/20">
          <CardContent className="p-4">
            <Text className="text-sm text-destructive">
              {goal.name.trim().length === 0
                ? "Please enter an event or goal name"
                : weeksUntil < 4
                  ? "We recommend at least 4 weeks to build a proper training plan"
                  : ""}
            </Text>
          </CardContent>
        </Card>
      )}
    </WizardStep>
  );
}
