import * as React from "react";

import {
  Card as RegistryCard,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../../registry/native/card";
import { getNativeTestProps } from "../../lib/test-props";

type CardProps = React.ComponentProps<typeof RegistryCard> & {
  accessibilityLabel?: string;
  id?: string;
  role?: string;
  testId?: string;
};

function Card({ accessibilityLabel, id, role, testId, ...props }: CardProps) {
  return (
    <RegistryCard
      {...(getNativeTestProps({ accessibilityLabel, id, role, testId }) as Partial<
        React.ComponentProps<typeof RegistryCard>
      >)}
      {...props}
    />
  );
}

export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
export type { CardProps };
