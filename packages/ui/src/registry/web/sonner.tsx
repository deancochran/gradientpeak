"use client";

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import { omitUndefined } from "../../lib/omit-undefined";

const Toaster = ({ theme, ...props }: ToasterProps) => {
  const { theme: systemTheme } = useTheme();
  const resolvedTheme: NonNullable<ToasterProps["theme"]> =
    systemTheme === "light" || systemTheme === "dark" ? systemTheme : "system";

  return (
    <Sonner
      theme={theme ?? resolvedTheme}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...omitUndefined(props)}
    />
  );
};

export { Toaster };
