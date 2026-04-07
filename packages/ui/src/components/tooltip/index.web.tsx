import * as React from "react";

import {
  Tooltip as RegistryTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../registry/web/tooltip";

function Tooltip(props: React.ComponentProps<typeof RegistryTooltip>) {
  return (
    <TooltipProvider>
      <RegistryTooltip {...props} />
    </TooltipProvider>
  );
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
