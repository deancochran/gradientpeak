import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { type CalendarMode } from "@/lib/calendar/dateMath";

export type CalendarSheetState = "closed" | "calendar-actions" | "event-preview";

type CalendarStoreState = {
  mode: CalendarMode;
  activeDate: string | null;
  visibleAnchor: string | null;
  selectedEventId: string | null;
  sheetState: CalendarSheetState;
  hydrated: boolean;
  setHydrated: (hydrated: boolean) => void;
  setMode: (mode: CalendarMode) => void;
  setActiveDate: (dateKey: string | null) => void;
  setVisibleAnchor: (dateKey: string | null) => void;
  setSelectedEventId: (eventId: string | null) => void;
  setSheetState: (sheetState: CalendarSheetState) => void;
};

export const useCalendarStore = create<CalendarStoreState>()(
  persist(
    (set) => ({
      mode: "day",
      activeDate: null,
      visibleAnchor: null,
      selectedEventId: null,
      sheetState: "closed",
      hydrated: false,
      setHydrated: (hydrated) => set({ hydrated }),
      setMode: (mode) => set({ mode }),
      setActiveDate: (activeDate) => set({ activeDate }),
      setVisibleAnchor: (visibleAnchor) => set({ visibleAnchor }),
      setSelectedEventId: (selectedEventId) => set({ selectedEventId }),
      setSheetState: (sheetState) => set({ sheetState }),
    }),
    {
      name: "gradientpeak-calendar-store",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        mode: state.mode,
        activeDate: state.activeDate,
        visibleAnchor: state.visibleAnchor,
        selectedEventId: state.selectedEventId,
        sheetState: state.sheetState,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (state && !error) {
          state.setHydrated(true);
        } else if (state) {
          state.setHydrated(true);
        }
      },
    },
  ),
);
