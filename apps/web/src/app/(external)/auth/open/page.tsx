"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";

const isDeepLink = (value: string) => {
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return false;
  return !/^https?:\/\//i.test(value);
};

const getSafeFallback = (value: string | null) => {
  if (!value) return "/auth/login";
  if (value.startsWith("/")) return value;

  if (typeof window === "undefined") return "/auth/login";

  try {
    const parsed = new URL(value);
    if (parsed.origin === window.location.origin) {
      return parsed.toString();
    }
  } catch {
    return "/auth/login";
  }

  return "/auth/login";
};

export default function OpenAuthTargetPage() {
  const searchParams = useSearchParams();
  const nextTarget = searchParams.get("next");
  const fallbackTarget = useMemo(
    () => getSafeFallback(searchParams.get("fallback")),
    [searchParams],
  );

  useEffect(() => {
    const fallbackTimer = window.setTimeout(() => {
      window.location.replace(fallbackTarget);
    }, 1500);

    if (nextTarget && isDeepLink(nextTarget)) {
      window.location.assign(nextTarget);
    }

    return () => {
      window.clearTimeout(fallbackTimer);
    };
  }, [fallbackTarget, nextTarget]);

  const handleOpenApp = () => {
    if (nextTarget && isDeepLink(nextTarget)) {
      window.location.assign(nextTarget);
    }
  };

  const handleContinueWeb = () => {
    window.location.assign(fallbackTarget);
  };

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Opening GradientPeak...</CardTitle>
            <CardDescription>
              We are trying to open the app. If it does not open, continue on
              web.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button onClick={handleOpenApp}>Open Mobile App</Button>
            <Button variant="outline" onClick={handleContinueWeb}>
              Continue on Web
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
