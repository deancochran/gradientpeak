import {
  grantOrganizationStaffRole,
  loadOrganizationStaff,
  revokeOrganizationStaffRole,
} from "./staff-server-functions";

export { loadOrganizationStaff as loadOrganizationRoleStaff };

export type OrganizationRoleCommand = {
  organizationId: string;
  membershipId: string;
  mutation: "grant" | "revoke";
  operationId: string;
  role: "admin" | "coach";
};

/**
 * Keep the role page on the same request-bound API boundary as the staff
 * roster. The server functions validate the payload and reauthorize every
 * attempt; this dispatcher deliberately makes no local authorization claim.
 */
export function submitOrganizationRoleCommand(command: OrganizationRoleCommand) {
  const submit =
    command.mutation === "grant" ? grantOrganizationStaffRole : revokeOrganizationStaffRole;
  return submit({
    data: {
      organizationId: command.organizationId,
      membershipId: command.membershipId,
      operationId: command.operationId,
      role: command.role,
    },
  });
}
