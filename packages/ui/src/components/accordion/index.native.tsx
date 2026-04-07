import * as React from "react";

import {
  Accordion as RegistryAccordion,
  AccordionContent,
  AccordionItem as RegistryAccordionItem,
  AccordionTrigger,
} from "../../registry/native/accordion";
import { getNativeTestProps } from "../../lib/test-props";
import type { AccordionTestProps } from "./shared";

function Accordion(props: React.ComponentProps<typeof RegistryAccordion>) {
  return <RegistryAccordion {...props} />;
}

function AccordionItem({
  accessibilityLabel,
  id,
  testId,
  ...props
}: Omit<React.ComponentProps<typeof RegistryAccordionItem>, "nativeID" | "testID"> &
  AccordionTestProps) {
  const { role: _unusedRole, ...nativeTestProps } = getNativeTestProps({
    accessibilityLabel,
    id,
    testId,
  });

  return <RegistryAccordionItem {...nativeTestProps} {...props} />;
}

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger };
