import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { Text } from "@repo/ui/components/text";
import { useState } from "react";
import { ActivityIndicator, Modal, Platform, TouchableOpacity, View } from "react-native";
import { parseDateKey, toDateKey } from "@/lib/calendar/dateMath";

type CalendarTimelineToolbarProps = {
  dateKey: string;
  isJumpLoading: boolean;
  monthTitle: string;
  onCreateEvent: () => void;
  onJumpDate: (dateKey: string) => void;
  onMoveMonth: (months: number) => void;
  onResetToday: () => void;
};

export function CalendarTimelineToolbar({
  dateKey,
  isJumpLoading,
  monthTitle,
  onCreateEvent,
  onJumpDate,
  onMoveMonth,
  onResetToday,
}: CalendarTimelineToolbarProps) {
  const [isPickerVisible, setIsPickerVisible] = useState(false);
  const [draftDate, setDraftDate] = useState(() => parseDateKey(dateKey));

  const commitDate = (date: Date) => {
    setIsPickerVisible(false);
    onJumpDate(toDateKey(date));
  };

  const handlePickerChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (event.type === "dismissed") {
      setIsPickerVisible(false);
      return;
    }
    if (selectedDate) {
      setDraftDate(selectedDate);
    }
  };

  const handleOpenPicker = () => {
    const initialDate = parseDateKey(dateKey);
    setDraftDate(initialDate);

    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        display: "default",
        mode: "date",
        onChange: (event, selectedDate) => {
          if (event.type === "set" && selectedDate) {
            commitDate(selectedDate);
          }
        },
        value: initialDate,
      });
      return;
    }

    setIsPickerVisible(true);
  };

  return (
    <View
      className="border-b border-border bg-background px-4 py-2"
      testID="calendar-timeline-toolbar"
    >
      <View className="flex-row items-center justify-between gap-3">
        <TouchableOpacity
          accessibilityLabel="Previous calendar month"
          accessibilityRole="button"
          className="h-9 w-9 items-center justify-center rounded-full border border-border bg-card"
          onPress={() => onMoveMonth(-1)}
          testID="calendar-previous-month"
        >
          <Text className="text-lg text-foreground">‹</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityHint="Opens a date picker"
          accessibilityLabel={`Choose calendar date, ${monthTitle}`}
          accessibilityRole="button"
          activeOpacity={0.85}
          className="min-w-0 flex-1 rounded-lg py-1"
          onPress={handleOpenPicker}
          testID="calendar-date-jump-entry"
        >
          <Text
            className="text-xl font-bold tracking-tight text-foreground"
            testID="calendar-visible-month-label"
          >
            {monthTitle}
          </Text>
        </TouchableOpacity>

        {isJumpLoading ? (
          <ActivityIndicator
            accessibilityLabel="Loading selected calendar date"
            size="small"
            testID="calendar-date-jump-loading"
          />
        ) : null}

        <TouchableOpacity
          accessibilityLabel="Go to today"
          accessibilityRole="button"
          activeOpacity={0.85}
          className="rounded-full border border-border bg-card px-3 py-2"
          onPress={onResetToday}
          testID="calendar-reset-today-entry"
        >
          <Text className="text-sm font-medium text-foreground">Today</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityLabel="Next calendar month"
          accessibilityRole="button"
          className="h-9 w-9 items-center justify-center rounded-full border border-border bg-card"
          onPress={() => onMoveMonth(1)}
          testID="calendar-next-month"
        >
          <Text className="text-lg text-foreground">›</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityLabel="Create calendar event"
          accessibilityRole="button"
          activeOpacity={0.85}
          className="h-9 w-9 items-center justify-center rounded-full bg-primary"
          onPress={onCreateEvent}
          testID="create-event-entry"
        >
          <Text className="text-xl font-light leading-none text-primary-foreground">+</Text>
        </TouchableOpacity>
      </View>

      {Platform.OS !== "android" && isPickerVisible ? (
        <Modal
          animationType="fade"
          onRequestClose={() => setIsPickerVisible(false)}
          transparent
          visible
        >
          <View className="flex-1 items-center justify-center bg-black/40 px-5">
            <View className="w-full max-w-md gap-3 rounded-2xl bg-background p-4">
              <DateTimePicker
                display="spinner"
                mode="date"
                onChange={handlePickerChange}
                testID="calendar-date-picker"
                value={draftDate}
              />
              <View className="flex-row justify-end gap-2">
                <TouchableOpacity
                  accessibilityRole="button"
                  className="rounded-full border border-border px-4 py-2"
                  onPress={() => setIsPickerVisible(false)}
                >
                  <Text className="text-sm text-foreground">Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button"
                  className="rounded-full bg-primary px-4 py-2"
                  onPress={() => commitDate(draftDate)}
                  testID="calendar-date-jump-confirm"
                >
                  <Text className="text-sm font-medium text-primary-foreground">Go</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}
