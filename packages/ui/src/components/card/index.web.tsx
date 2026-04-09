import * as React from "react";
import { getWebTestProps } from "../../lib/test-props";
import {
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Card as RegistryCard,
} from "../../registry/web/card";

type CardProps = React.ComponentProps<typeof RegistryCard> & {
  accessibilityLabel?: string;
  id?: string;
  role?: string;
  testId?: string;
};

function Card({ accessibilityLabel, id, role, testId, ...props }: CardProps) {
  return <RegistryCard {...getWebTestProps({ accessibilityLabel, id, role, testId })} {...props} />;
}

export type { CardProps };
export { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
