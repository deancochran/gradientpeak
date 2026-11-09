import { type CalendarDayVisualState, describeCalendarDayVisualState } from "@repo/core/calendar";
import { Text } from "@repo/ui/components/text";
import { View } from "react-native";

function CalendarDateMark({
  day,
  state,
  today,
}: {
  day: number;
  state: CalendarDayVisualState;
  today: boolean;
}) {
  if (state.signal.kind === "rest") {
    return (
      <Text
        className={`text-base font-semibold ${today ? "text-primary" : "text-foreground"}`}
        testID={`calendar-day-number-${day}`}
      >
        {day}
      </Text>
    );
  }

  return (
    <View className="relative h-11 w-11 items-center justify-center">
      {state.signal.kind === "goal" ? (
        <View
          className="absolute inset-0 z-10 overflow-hidden rounded-full border-2 border-yellow-200 bg-amber-500"
          testID="calendar-day-signal-goal"
        >
          <View className="absolute -bottom-1 inset-x-0 h-4 rounded-full bg-amber-700/30" />
          <View className="absolute left-2 top-1.5 h-1.5 w-4 -rotate-12 rounded-full bg-yellow-100/80" />
        </View>
      ) : null}

      {state.signal.kind === "planned" ? (
        <View
          className={`absolute inset-0 rounded-full border-2 border-blue-500 ${
            state.signal.loadDepth === "unknown" ? "opacity-40" : ""
          }`}
          testID="calendar-day-signal-planned"
        />
      ) : null}

      {state.signal.kind === "completed" ? (
        <View
          className={`absolute inset-0 rounded-full border-2 border-emerald-400 bg-emerald-500 ${
            state.signal.loadDepth === "unknown" ? "opacity-40" : ""
          }`}
          testID="calendar-day-signal-completed"
        />
      ) : null}

      {state.signal.kind === "completed_with_unaccounted_plan" ? (
        <View
          className={`absolute inset-0 flex-row overflow-hidden rounded-full ${
            state.signal.loadDepth === "unknown" ? "opacity-40" : ""
          }`}
          testID="calendar-day-signal-completed-with-unaccounted-plan"
        >
          <View
            className="h-full flex-1 rounded-l-full border-y-2 border-l-2 border-r-0 border-y-emerald-500 border-l-emerald-500"
            testID="calendar-day-signal-completed-half"
          />
          <View
            className="h-full flex-1 rounded-r-full border-y-2 border-r-2 border-l-0 border-y-blue-500 border-r-blue-500"
            testID="calendar-day-signal-planned-half"
          />
        </View>
      ) : null}

      <Text
        className={`z-20 text-base font-bold ${
          state.signal.kind === "goal"
            ? "text-slate-950"
            : state.signal.kind === "completed"
              ? "text-white"
              : "text-foreground"
        }`}
        testID={`calendar-day-number-${day}`}
      >
        {day}
      </Text>
    </View>
  );
}

export function CalendarDayVisual({
  day,
  decorative = false,
  muted = false,
  selected = false,
  state,
  today = false,
}: {
  day: number;
  decorative?: boolean;
  muted?: boolean;
  selected?: boolean;
  state: CalendarDayVisualState;
  today?: boolean;
}) {
  return (
    <View
      accessibilityElementsHidden={decorative}
      accessibilityLabel={decorative ? undefined : describeCalendarDayVisualState(state)}
      accessibilityRole={decorative ? undefined : "image"}
      className={`h-12 w-12 items-center justify-center rounded-full border-2 ${
        selected ? "border-primary" : "border-transparent"
      } ${muted ? "opacity-35" : ""}`}
      importantForAccessibility={decorative ? "no-hide-descendants" : "yes"}
      testID="calendar-day-visual"
    >
      <CalendarDateMark day={day} state={state} today={today} />
    </View>
  );
}
