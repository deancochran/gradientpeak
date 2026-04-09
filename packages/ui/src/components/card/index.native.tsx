import * as React from "react";
import { getNativeTestProps } from "../../lib/test-props";
import {
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Card as RegistryCard,
} from "../../registry/native/card";

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

export type { CardProps };
export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
