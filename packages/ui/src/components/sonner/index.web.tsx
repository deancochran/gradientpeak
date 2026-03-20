"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

import { TOASTER_STYLE_VARS } from "./shared";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      style={TOASTER_STYLE_VARS}
      {...props}
    />
  );
};

export { Toaster };
