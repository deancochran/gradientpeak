import * as React from "react";

import type { ToggleGroupContextValue } from "./shared";

const ToggleGroupContext = React.createContext<ToggleGroupContextValue | null>(
  null,
);

export { ToggleGroupContext };
