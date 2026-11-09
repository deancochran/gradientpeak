import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type ProductAnalyticsConsent = "denied" | "granted";

type ProductAnalyticsConsentStore = {
  consent: ProductAnalyticsConsent;
  hasHydrated: boolean;
  setConsent: (consent: boolean) => void;
};

export const useProductAnalyticsConsentStore = create<ProductAnalyticsConsentStore>()(
  persist(
    (set) => ({
      // Unknown consent is deliberately represented as denied until hydration completes.
      consent: "denied",
      hasHydrated: false,
      setConsent: (granted) => set({ consent: granted ? "granted" : "denied" }),
    }),
    {
      name: "gradientpeak-product-analytics-consent",
      partialize: (state) => ({ consent: state.consent }),
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        useProductAnalyticsConsentStore.setState({
          consent: state?.consent === "granted" ? "granted" : "denied",
          hasHydrated: true,
        });
      },
    },
  ),
);

export function useProductAnalyticsConsent() {
  const consent = useProductAnalyticsConsentStore((state) => state.consent);
  const hasHydrated = useProductAnalyticsConsentStore((state) => state.hasHydrated);
  const setConsent = useProductAnalyticsConsentStore((state) => state.setConsent);
  return { consent, hasHydrated, setConsent };
}
