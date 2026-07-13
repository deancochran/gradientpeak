# API contract changes

## 2026-07-15 — plan visibility

Activity-plan and training-plan responses no longer include the legacy `is_public` field. Clients must use
`template_visibility` (`"private"` or `"public"`); system-template access remains represented separately by
`is_system_template`. No transport alias is retained because this repository has no supported-old-client policy,
and all current source clients use the canonical field after this change.
