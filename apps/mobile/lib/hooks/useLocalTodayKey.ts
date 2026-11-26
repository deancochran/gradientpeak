import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { millisecondsUntilNextLocalDay, toDateKey } from "@/lib/calendar/dateMath";

export function useLocalTodayKey() {
  const [todayKey, setTodayKey] = useState(() => toDateKey(new Date()));

  useEffect(() => {
    const refreshToday = () => {
      const nextTodayKey = toDateKey(new Date());
      if (nextTodayKey !== todayKey) setTodayKey(nextTodayKey);
    };
    const timeout = setTimeout(refreshToday, millisecondsUntilNextLocalDay(new Date()));
    const appStateSubscription = AppState?.addEventListener?.("change", (state) => {
      if (state === "active") refreshToday();
    });

    return () => {
      clearTimeout(timeout);
      appStateSubscription?.remove();
    };
  }, [todayKey]);

  return todayKey;
}
