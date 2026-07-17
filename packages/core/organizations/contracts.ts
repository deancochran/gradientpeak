import { z } from "zod";

import {
  ORGANIZATION_MEMBERSHIP_STATUSES,
  ORGANIZATION_PERMISSIONS,
  ORGANIZATION_ROLE_GRANT_STATUSES,
} from "./constants";

export const organizationPermissionSchema = z.enum(ORGANIZATION_PERMISSIONS);
export const organizationMembershipStatusSchema = z.enum(ORGANIZATION_MEMBERSHIP_STATUSES);
export const organizationRoleGrantStatusSchema = z.enum(ORGANIZATION_ROLE_GRANT_STATUSES);

export const organizationCapabilityCheckSchema = z
  .object({
    organizationId: z.string().uuid(),
    profileId: z.string().uuid(),
    permission: organizationPermissionSchema,
  })
  .strict()
  .readonly();

export type OrganizationCapabilityCheck = z.infer<typeof organizationCapabilityCheckSchema>;
