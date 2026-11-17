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

import { useTheme } from "../providers/theme-provider";

const productAnalyticsConsentStorageKey = "gradientpeak-product-analytics-consent";

export function ProductAnalyticsCard() {
  const posthog = usePostHog();
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const storedConsent = window.localStorage.getItem(productAnalyticsConsentStorageKey);
    setEnabled(
      storedConsent === "granted" ||
        (storedConsent === null && posthog?.has_opted_out_capturing?.() === false),
    );
  }, [posthog]);

  const updateConsent = (nextEnabled: boolean) => {
    window.localStorage.setItem(
      productAnalyticsConsentStorageKey,
      nextEnabled ? "granted" : "denied",
    );
    if (nextEnabled) {
      posthog?.opt_in_capturing?.({ captureEventName: false });
    } else {
      posthog?.opt_out_capturing?.();
    }
    setEnabled(nextEnabled);
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
