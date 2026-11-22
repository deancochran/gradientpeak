import { appRouter } from "../routers";
import {
  type ActualProcedure,
  createApiCapabilityCatalog,
  createCapabilityEvidenceRegistry,
} from "./catalog";

/** The flattened real router is the only complete endpoint inventory. */
export function discoverRouterInventory(router: {
  _def: { procedures: unknown };
}): ActualProcedure[] {
  const procedures = router._def.procedures as Record<
    string,
    { _def: { type: "mutation" | "query" | "subscription" } }
  >;
  return Object.entries(procedures)
    .map(([id, procedure]) => ({ id, procedureType: procedure._def.type }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export const apiRouterInventory = discoverRouterInventory(appRouter);
export const apiCapabilityCatalog = createApiCapabilityCatalog(apiRouterInventory);
export const capabilityEvidenceRegistry = createCapabilityEvidenceRegistry(apiCapabilityCatalog);
