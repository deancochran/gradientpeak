import * as React from "react";
import { getNativeTestProps } from "../../lib/test-props";
import {
  AccordionContent,
  AccordionTrigger,
  Accordion as RegistryAccordion,
  AccordionItem as RegistryAccordionItem,
} from "../../registry/native/accordion";
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
