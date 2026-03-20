"use client";

import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { ChevronDownIcon } from "lucide-react";
import * as React from "react";

import { cn } from "../../lib/cn";
import { getWebTestProps } from "../../lib/test-props";
import type { AccordionTestProps } from "./shared";

function accordionItemVariants(className?: string) {
  return cn("border-b last:border-b-0", className);
}

function accordionTriggerVariants(className?: string) {
  return cn(
    "focus-visible:border-ring focus-visible:ring-ring/50 flex flex-1 items-start justify-between gap-4 rounded-md py-4 text-left text-sm font-medium transition-all outline-none hover:underline focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 [&[data-state=open]>svg]:rotate-180",
    className,
  );
}

function accordionChevronVariants() {
  return "text-muted-foreground pointer-events-none size-4 shrink-0 translate-y-0.5 transition-transform duration-200";
}

function accordionContentVariants() {
  return "overflow-hidden text-sm data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down";
}

function accordionContentInnerVariants(className?: string) {
  return cn("pb-4", className);
}

function Accordion(
  props: React.ComponentProps<typeof AccordionPrimitive.Root>,
) {
  return <AccordionPrimitive.Root data-slot="accordion" {...props} />;
}

function AccordionItem({
  className,
  accessibilityLabel,
  id,
  role,
  testId,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Item> & AccordionTestProps) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={accordionItemVariants(className)}
      {...getWebTestProps({ accessibilityLabel, id, role, testId })}
      {...props}
    />
  );
}

function AccordionTrigger({
  children,
  className,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={accordionTriggerVariants(className)}
        {...props}
      >
        {children}
        <ChevronDownIcon className={accordionChevronVariants()} />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

function AccordionContent({
  children,
  className,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content
      data-slot="accordion-content"
      className={accordionContentVariants()}
      {...props}
    >
      <div className={accordionContentInnerVariants(`pt-0 ${className ?? ""}`)}>
        {children}
      </div>
    </AccordionPrimitive.Content>
  );
}

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger };
