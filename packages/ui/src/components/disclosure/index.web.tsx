import { ChevronDown } from "lucide-react";
import { useId } from "react";
import { cn } from "../../lib/cn";

import type { DisclosureProps } from "./shared";

export type { DisclosureProps } from "./shared";

/** A compact, controlled progressive-disclosure section shared by app forms. */
export function Disclosure({
  children,
  className,
  disabled,
  label,
  onOpenChange,
  open,
  testId,
}: DisclosureProps) {
  const contentId = useId();
  return (
    <section className={cn("space-y-2", className)} data-testid={testId}>
      <button
        aria-expanded={open}
        aria-controls={open ? contentId : undefined}
        className="flex min-h-11 items-center gap-2 rounded-md px-1 text-sm font-medium hover:bg-muted disabled:opacity-50"
        disabled={disabled}
        type="button"
        onClick={() => onOpenChange(!open)}
      >
        <ChevronDown
          aria-hidden="true"
          className={cn("size-4 transition-transform", open && "rotate-180")}
        />
        {label}
      </button>
      {open ? (
        <div id={contentId} className="space-y-2">
          {children}
        </div>
      ) : null}
    </section>
  );
}
