import { createContext, useContext } from "react";

export type OrganizationGroupAccessScope = Readonly<{
  organizationId: string;
  groupId: string;
  actorProfileId: string;
  generation: number;
}>;
type AccessLossContext = {
  scope: OrganizationGroupAccessScope;
  reportAccessLost: (scope: OrganizationGroupAccessScope) => void;
};
const GroupAccessLossContext = createContext<AccessLossContext | null>(null);

export const OrganizationGroupAccessLossProvider = GroupAccessLossContext.Provider;

/** Lets a scoped child redact its still-mounted parent when the authoritative read loses access. */
export function useOrganizationGroupAccessLoss() {
  return useContext(GroupAccessLossContext);
}
