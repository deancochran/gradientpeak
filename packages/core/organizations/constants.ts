export const ORGANIZATION_PERMISSIONS = ["coaching.access"] as const;
export type OrganizationPermission = (typeof ORGANIZATION_PERMISSIONS)[number];

export const COACHING_ACCESS_PERMISSION = "coaching.access" satisfies OrganizationPermission;

export const ORGANIZATION_MEMBERSHIP_STATUSES = ["active", "inactive"] as const;
export type OrganizationMembershipStatus = (typeof ORGANIZATION_MEMBERSHIP_STATUSES)[number];

export const ORGANIZATION_ROLE_GRANT_STATUSES = ["active", "inactive"] as const;
export type OrganizationRoleGrantStatus = (typeof ORGANIZATION_ROLE_GRANT_STATUSES)[number];
