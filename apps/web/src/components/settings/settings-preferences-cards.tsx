import { usePostHog } from "@posthog/react";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Label } from "@repo/ui/components/label";
import { Switch } from "@repo/ui/components/switch";
import { useEffect, useState } from "react";

import { useProductAnalyticsProviderStatus } from "../providers/app-providers";
import { useTheme } from "../providers/theme-provider";

const productAnalyticsConsentStorageKey = "gradientpeak-product-analytics-consent";

function readProductAnalyticsConsent() {
  try {
    return window.localStorage.getItem(productAnalyticsConsentStorageKey) === "granted";
  } catch {
    return false;
  }
}

function persistProductAnalyticsConsent(enabled: boolean) {
  try {
    window.localStorage.setItem(productAnalyticsConsentStorageKey, enabled ? "granted" : "denied");
    return true;
  } catch {
    return false;
  }
}

export function ProductAnalyticsCard() {
  const posthog = usePostHog();
  const [enabled, setEnabled] = useState(false);
  const [hasLoadedConsent, setHasLoadedConsent] = useState(false);
  const analyticsProviderStatus = useProductAnalyticsProviderStatus();
  const canUseAnalyticsPreference = analyticsProviderStatus !== "initializing";
  const canCallAnalyticsSdk = analyticsProviderStatus === "ready";

  useEffect(() => {
    const storedConsent = readProductAnalyticsConsent();
    setEnabled(storedConsent);
    setHasLoadedConsent(true);
  }, []);

  const updateConsent = (nextEnabled: boolean) => {
    if (!persistProductAnalyticsConsent(nextEnabled)) {
      setEnabled(false);
      if (canCallAnalyticsSdk) {
        try {
          posthog?.opt_out_capturing?.();
        } catch {
          // The UI remains opted out even when the SDK cannot accept the update.
        }
      }
      return;
    }

    setEnabled(nextEnabled);
    if (canCallAnalyticsSdk) {
      try {
        if (nextEnabled) {
          posthog?.opt_in_capturing?.({ captureEventName: false });
        } else {
          posthog?.opt_out_capturing?.();
        }
      } catch {
        // The persisted preference is applied after a configured provider is ready.
      }
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Product analytics</CardTitle>
        <CardDescription>
          Opt in to anonymous product usage and page navigation analytics.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="product-analytics-consent">Product analytics</Label>
          <Switch
            checked={enabled}
            disabled={!hasLoadedConsent || !canUseAnalyticsPreference}
            id="product-analytics-consent"
            onCheckedChange={updateConsent}
          />
        </div>
      </CardContent>
    </Card>
  );
}

export function AppearanceCard() {
  const { theme, setTheme } = useTheme();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Theme</CardTitle>
        <CardDescription>Choose a light, dark, or system-matched appearance.</CardDescription>
      </CardHeader>
      <CardContent>
        <fieldset className="grid grid-cols-3 gap-2" aria-label="Theme preference">
          {(["light", "dark", "system"] as const).map((option) => (
            <Button
              key={option}
              type="button"
              variant={theme === option ? "default" : "outline"}
              aria-pressed={theme === option}
              onClick={() => setTheme(option)}
              className="capitalize"
            >
              {option}
            </Button>
          ))}
        </fieldset>
      </CardContent>
    </Card>
  );
}
