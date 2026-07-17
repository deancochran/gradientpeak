import {
  COACHING_ACCESS_PERMISSION,
  organizationCapabilityCheckSchema,
} from "@repo/core/organizations";
import type {
  OrganizationAccessRepository,
  OrganizationIdentity,
} from "../../repositories/organization-access-repository";

export type OrganizationCoachingAccess =
  | { status: "granted"; organization: OrganizationIdentity }
  | { status: "forbidden" };

export async function readOrganizationCoachingAccess({
  repository,
  organizationId,
  profileId,
}: {
  repository: OrganizationAccessRepository;
  organizationId: string;
  profileId: string;
}): Promise<OrganizationCoachingAccess> {
  const check = organizationCapabilityCheckSchema.parse({
    organizationId,
    profileId,
    permission: COACHING_ACCESS_PERMISSION,
  });
  const organization = await repository.findOrganizationWithCapability(check);

  return organization ? { status: "granted", organization } : { status: "forbidden" };
}
