import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type CalendarStoreState = {
  activeDate: string | null;
  hydrated: boolean;
  setHydrated: (hydrated: boolean) => void;
  setActiveDate: (dateKey: string | null) => void;
};

export const useCalendarStore = create<CalendarStoreState>()(
  persist(
    (set) => ({
      activeDate: null,
      hydrated: false,
      setHydrated: (hydrated) => set({ hydrated }),
      setActiveDate: (activeDate) => set({ activeDate }),
    }),
    {
      name: "gradientpeak-calendar-store",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        activeDate: state.activeDate,
      }),
      onRehydrateStorage: () => (_state, _error) => {
        useCalendarStore.setState({ hydrated: true });
      },
    },
  ),
);
