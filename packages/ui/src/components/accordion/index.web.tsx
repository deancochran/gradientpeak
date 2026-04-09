"use client";

import * as React from "react";
import { getWebTestProps } from "../../lib/test-props";
import {
  Accordion,
  AccordionContent,
  AccordionTrigger,
  AccordionItem as RegistryAccordionItem,
} from "../../registry/web/accordion";
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
