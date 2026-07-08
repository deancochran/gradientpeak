import { create } from "zustand";

type TrainingPreferencesSheetState = {
  visible: boolean;
  close: () => void;
  open: () => void;
};

export const useTrainingPreferencesSheetStore = create<TrainingPreferencesSheetState>((set) => ({
  visible: false,
  close: () => set({ visible: false }),
  open: () => set({ visible: true }),
}));
