# Organization group detail contract

The W04 detail route consumes only the active-group DTO returned by
`organizations.organizationGroups.get`: `id`, `name`, `description`, and `createdAt`.

It may archive the same `organizationId`/`groupId` pair after explicit confirmation.
An acknowledged archive retains a committed receipt without revalidating the now
unavailable detail. Back to groups enters the list route and loads active groups.
The detail does not offer metadata editing or athlete/coach assignment.

## W05/W06 integration seam

The coordinator should keep the group-detail route as the active-group gate and expose
child composition slots through its `<Outlet />`. Each dependent child owns its own
loader, pending/error UI, and query/command invalidation. The detail parent owns only
the active-group read, archive lifecycle, and identity fence. It must not preload or
retain athlete/coach assignment data.

Children receive `organizationId` and `groupId` from route params, not from W04 local
state. They must re-check active-group authorization through their own server boundary.
When W04 archive is acknowledged, the parent route must hide its children immediately;
the archive acknowledgement remains final; do not invalidate the archived detail
and replace its receipt with an unavailable-group boundary.
W05/W06 must not extend the create/archive payloads or make archived groups visible.
