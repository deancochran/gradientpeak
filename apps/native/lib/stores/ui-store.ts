import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type ModalType =
  | "workout-options"
  | "workout-settings"
  | "activity-details"
  | "profile-settings"
  | "delete-confirmation"
  | "sync-status"
  | "bluetooth-devices"
  | "achievements"
  | "feedback"
  | "about"
  | null;

export type TabType =
  | "dashboard"
  | "activities"
  | "plans"
  | "profile"
  | "settings";

export type AlertType = "success" | "error" | "warning" | "info";

export interface Alert {
  id: string;
  type: AlertType;
  title: string;
  message: string;
  duration?: number; // auto-dismiss after ms
  action?: {
    label: string;
    onPress: () => void;
  };
}

export interface BottomSheet {
  id: string;
  content:
    | "workout-actions"
    | "activity-filters"
    | "sharing-options"
    | "export-options";
  data?: Record<string, unknown>;
}

export interface LoadingState {
  global: boolean;
  workout: boolean;
  sync: boolean;
  profile: boolean;
  activities: boolean;
}

export interface UIState {
  // Modal management
  activeModal: ModalType;
  modalData: Record<string, unknown> | null;

  // Tab navigation
  activeTab: TabType;
  tabHistory: TabType[];

  // Bottom sheet management
  activeBottomSheet: BottomSheet | null;

  // Alert/Toast management
  alerts: Alert[];

  // Loading states
  loading: LoadingState;

  // Drawer/sidebar state
  isDrawerOpen: boolean;

  // Keyboard state
  isKeyboardVisible: boolean;
  keyboardHeight: number;

  // Screen orientation
  orientation: "portrait" | "landscape";

  // Pull-to-refresh states
  refreshing: {
    dashboard: boolean;
    activities: boolean;
    plans: boolean;
    profile: boolean;
  };

  // Search states
  searchQuery: string;
  searchFocused: boolean;

  // Filter states
  activeFilters: {
    activities: Record<string, unknown>;
    plans: Record<string, unknown>;
  };

  // Scroll positions (for maintaining scroll state)
  scrollPositions: Record<string, number>;

  // Actions
  openModal: (type: ModalType, data?: Record<string, unknown>) => void;
  closeModal: () => void;
  setActiveTab: (tab: TabType) => void;
  navigateBack: () => void;
  openBottomSheet: (
    content: BottomSheet["content"],
    data?: Record<string, unknown>,
  ) => void;
  closeBottomSheet: () => void;
  showAlert: (alert: Omit<Alert, "id">) => string;
  dismissAlert: (id: string) => void;
  clearAllAlerts: () => void;
  setLoading: (key: keyof LoadingState, loading: boolean) => void;
  setDrawerOpen: (open: boolean) => void;
  setKeyboardVisible: (visible: boolean, height?: number) => void;
  setOrientation: (orientation: "portrait" | "landscape") => void;
  setRefreshing: (
    screen: keyof UIState["refreshing"],
    refreshing: boolean,
  ) => void;
  setSearchQuery: (query: string) => void;
  setSearchFocused: (focused: boolean) => void;
  setActiveFilters: (
    screen: keyof UIState["activeFilters"],
    filters: Record<string, unknown>,
  ) => void;
  setScrollPosition: (screen: string, position: number) => void;
  getScrollPosition: (screen: string) => number;
  resetUIState: () => void;
}

const defaultLoadingState: LoadingState = {
  global: false,
  workout: false,
  sync: false,
  profile: false,
  activities: false,
};

const defaultRefreshingState = {
  dashboard: false,
  activities: false,
  plans: false,
  profile: false,
};

const defaultActiveFilters = {
  activities: {},
  plans: {},
};

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      // Initial state
      activeModal: null,
      modalData: null,
      activeTab: "dashboard",
      tabHistory: ["dashboard"],
      activeBottomSheet: null,
      alerts: [],
      loading: defaultLoadingState,
      isDrawerOpen: false,
      isKeyboardVisible: false,
      keyboardHeight: 0,
      orientation: "portrait",
      refreshing: defaultRefreshingState,
      searchQuery: "",
      searchFocused: false,
      activeFilters: defaultActiveFilters,
      scrollPositions: {},

      // Actions
      openModal: (type: ModalType, data?: Record<string, unknown>) => {
        set({
          activeModal: type,
          modalData: data || null,
        });
        console.log("📱 UI Store: Opened modal", type, data ? "with data" : "");
      },

      closeModal: () => {
        set({
          activeModal: null,
          modalData: null,
        });
        console.log("📱 UI Store: Closed modal");
      },

      setActiveTab: (tab: TabType) => {
        const { tabHistory } = get();
        const newHistory = [tab, ...tabHistory.filter((t) => t !== tab)].slice(
          0,
          5,
        ); // Keep last 5 tabs

        set({
          activeTab: tab,
          tabHistory: newHistory,
        });
        console.log("📱 UI Store: Changed tab to", tab);
      },

      navigateBack: () => {
        const { tabHistory, setActiveTab } = get();
        if (tabHistory.length > 1) {
          setActiveTab(tabHistory[1]);
        }
      },

      openBottomSheet: (
        content: BottomSheet["content"],
        data?: Record<string, unknown>,
      ) => {
        const bottomSheet: BottomSheet = {
          id: `sheet_${Date.now()}`,
          content,
          data,
        };

        set({ activeBottomSheet: bottomSheet });
        console.log("📱 UI Store: Opened bottom sheet", content);
      },

      closeBottomSheet: () => {
        set({ activeBottomSheet: null });
        console.log("📱 UI Store: Closed bottom sheet");
      },

      showAlert: (alert: Omit<Alert, "id">) => {
        const id = `alert_${Date.now()}`;
        const newAlert: Alert = { ...alert, id };

        set((state) => ({
          alerts: [...state.alerts, newAlert],
        }));

        // Auto-dismiss after duration
        if (alert.duration && alert.duration > 0) {
          setTimeout(() => {
            get().dismissAlert(id);
          }, alert.duration);
        }

        console.log("🚨 UI Store: Showed alert", alert.type, alert.title);
        return id;
      },

      dismissAlert: (id: string) => {
        set((state) => ({
          alerts: state.alerts.filter((alert) => alert.id !== id),
        }));
        console.log("🚨 UI Store: Dismissed alert", id);
      },

      clearAllAlerts: () => {
        set({ alerts: [] });
        console.log("🚨 UI Store: Cleared all alerts");
      },

      setLoading: (key: keyof LoadingState, loading: boolean) => {
        set((state) => ({
          loading: { ...state.loading, [key]: loading },
        }));
        console.log(`⏳ UI Store: Set ${key} loading:`, loading);
      },

      setDrawerOpen: (open: boolean) => {
        set({ isDrawerOpen: open });
        console.log("📱 UI Store: Set drawer open:", open);
      },

      setKeyboardVisible: (visible: boolean, height: number = 0) => {
        set({
          isKeyboardVisible: visible,
          keyboardHeight: height,
        });
        console.log(
          "⌨️ UI Store: Keyboard visible:",
          visible,
          "height:",
          height,
        );
      },

      setOrientation: (orientation: "portrait" | "landscape") => {
        set({ orientation });
        console.log("📱 UI Store: Orientation changed:", orientation);
      },

      setRefreshing: (
        screen: keyof UIState["refreshing"],
        refreshing: boolean,
      ) => {
        set((state) => ({
          refreshing: { ...state.refreshing, [screen]: refreshing },
        }));
        console.log(`🔄 UI Store: Set ${screen} refreshing:`, refreshing);
      },

      setSearchQuery: (query: string) => {
        set({ searchQuery: query });
      },

      setSearchFocused: (focused: boolean) => {
        set({ searchFocused: focused });
        console.log("🔍 UI Store: Search focused:", focused);
      },

      setActiveFilters: (
        screen: keyof UIState["activeFilters"],
        filters: Record<string, unknown>,
      ) => {
        set((state) => ({
          activeFilters: { ...state.activeFilters, [screen]: filters },
        }));
        console.log(`🔽 UI Store: Set ${screen} filters:`, filters);
      },

      setScrollPosition: (screen: string, position: number) => {
        set((state) => ({
          scrollPositions: { ...state.scrollPositions, [screen]: position },
        }));
      },

      getScrollPosition: (screen: string) => {
        return get().scrollPositions[screen] || 0;
      },

      resetUIState: () => {
        set({
          activeModal: null,
          modalData: null,
          activeBottomSheet: null,
          alerts: [],
          loading: defaultLoadingState,
          isDrawerOpen: false,
          refreshing: defaultRefreshingState,
          searchQuery: "",
          searchFocused: false,
          activeFilters: defaultActiveFilters,
        });
        console.log("🔄 UI Store: Reset UI state");
      },
    }),
    {
      name: "turbofit-ui-store",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        // Only persist certain UI preferences
        activeTab: state.activeTab,
        tabHistory: state.tabHistory,
        scrollPositions: state.scrollPositions,
        activeFilters: state.activeFilters,
        orientation: state.orientation,
      }),
    },
  ),
);

// Convenience hooks
export const useActiveModal = () => useUIStore((state) => state.activeModal);
export const useModalData = () => useUIStore((state) => state.modalData);
export const useActiveTab = () => useUIStore((state) => state.activeTab);
export const useActiveBottomSheet = () =>
  useUIStore((state) => state.activeBottomSheet);
export const useAlerts = () => useUIStore((state) => state.alerts);
export const useLoading = () => useUIStore((state) => state.loading);
export const useIsDrawerOpen = () => useUIStore((state) => state.isDrawerOpen);
export const useKeyboardState = () =>
  useUIStore((state) => ({
    visible: state.isKeyboardVisible,
    height: state.keyboardHeight,
  }));
export const useOrientation = () => useUIStore((state) => state.orientation);
export const useRefreshing = () => useUIStore((state) => state.refreshing);
export const useSearchState = () =>
  useUIStore((state) => ({
    query: state.searchQuery,
    focused: state.searchFocused,
  }));
