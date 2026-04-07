import * as React from "react";

import {
  Card as RegistryCard,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../../registry/web/card";
import { getWebTestProps } from "../../lib/test-props";

type CardProps = React.ComponentProps<typeof RegistryCard> & {
  accessibilityLabel?: string;
  id?: string;
  role?: string;
  testId?: string;
};

function Card({ accessibilityLabel, id, role, testId, ...props }: CardProps) {
  return <RegistryCard {...getWebTestProps({ accessibilityLabel, id, role, testId })} {...props} />;
}

export { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
export type { CardProps };
