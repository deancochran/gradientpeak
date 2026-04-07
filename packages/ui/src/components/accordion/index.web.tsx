"use client";

import * as React from "react";

import {
  Accordion,
  AccordionContent,
  AccordionItem as RegistryAccordionItem,
  AccordionTrigger,
} from "../../registry/web/accordion";
import { getWebTestProps } from "../../lib/test-props";
import type { AccordionTestProps } from "./shared";

function AccordionItem({
  accessibilityLabel,
  id,
  role,
  testId,
  ...props
}: React.ComponentProps<typeof RegistryAccordionItem> & AccordionTestProps) {
  return (
    <RegistryAccordionItem
      {...getWebTestProps({ accessibilityLabel, id, role, testId })}
      {...props}
    />
  );
}

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger };
