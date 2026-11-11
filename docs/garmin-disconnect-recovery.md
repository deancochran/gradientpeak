# Garmin disconnect recovery

## Scope and current evidence

This document describes the implemented **local safety behavior** for a Garmin
disconnect. It is not a production-readiness claim and it does not establish
that Garmin has revoked a user registration in every interrupted case.

The Garmin OAuth 2.0 PKCE specification supplied for this integration requires
`DELETE https://apis.garmin.com/wellness-api/rest/user/registration` when the
product offers Disconnect or Delete My Account. A successful HTTP response to
that DELETE is the only currently implemented provider acceptance signal.

The supplied specification does **not** define whether a repeated DELETE that
returns `404`, `401`, or a network failure confirms a previous deregistration.
It also supplies no revoked-registration lookup or other reconciliation API.
GradientPeak must not infer confirmation from those outcomes.

## Durable outcome states

| State | Local behavior | Remote conclusion |
| --- | --- | --- |
| `active` | Credential use and normal integration behavior are permitted. | Registration has not been locally requested for removal. |
| `disconnect_pending` | New disconnect attempts are serialized; credentials are retained only to support an explicit recovery attempt. Normal work must not resume. | Removal is requested but unconfirmed. |
| `disconnected` | Local credentials are deleted only after a successful DELETE response and successful fenced local finalization. | Garmin accepted the DELETE response used by that finalization. |
| unknown remote outcome | Network loss after sending DELETE, `404`, `401`, a failed/expired local finalization lease, or any non-success result keeps `disconnect_pending` and credentials. | No conclusion. In particular, `404` and `401` are not confirmation. |

The lifecycle uses a generation, durable attempt receipt, owner, and expiry
lease. A stale or expired attempt cannot finalize and delete credentials. If a
DELETE response was accepted but its acknowledgement or local finalization was
lost, the safe result remains pending rather than local deletion. The user can
retry Disconnect and is directed to Garmin Connect when recovery remains
pending. A `401` makes the next explicit retry obtain a fresh access token; it
does not establish deregistration.

## Missing provider proof for full reconciliation

Provider-confirmed recovery after an acknowledgement loss is **not
implemented**. It requires primary Garmin contract evidence for at least one
of the following:

1. documented idempotent repeated DELETE semantics, including what `404` and
   `401` mean for a previously deleted registration;
2. an authenticated registration/revocation-status endpoint with documented
   consistency and authorization behavior; or
3. Garmin support/partner documentation defining a durable deletion receipt or
   callback that GradientPeak may treat as authoritative.

Until that evidence is accepted, unknown outcomes retain the recovery path and
must not be relabeled as confirmed remote revocation.

## Permissions lifecycle

The supplied Garmin document says the initial OAuth flow can fetch user
permissions, and post-consent changes are notified by a `User_Permission`
webhook. Its authenticity, delivery contract, replay identity, payload schema,
and revocation semantics are not established by the supplied OAuth document.

Before any Garmin data operation relies on a permission, the product needs an
accepted provider contract for post-connect permission refresh and
`User_Permission` notification verification/handling, including permission
revocation. No webhook hook is implemented from this document alone.

## Account teardown dependency

Manual Disconnect correctly attempts Garmin deregistration. Account deletion
is a separate orchestration dependency: database cascades are not evidence
that the provider DELETE occurred or was accepted. Do not claim account
teardown compliance until the owning account-deletion flow durably invokes,
recovers, and proves this provider lifecycle before local credential cleanup.
