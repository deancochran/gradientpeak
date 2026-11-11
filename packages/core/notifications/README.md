# Notification policy activation boundary

`evaluateNotificationPolicy` is a pure, point-in-time eligibility decision. It does not save preferences, request device permission, enqueue work, or send email/push notifications.

Activation requires an authorized preferences owner to durably supply category-and-channel consent, a current explicit IANA time zone, quiet hours, and a host-observed capability result. A `permission-off` push capability is terminal for this decision and must be surfaced as device-settings guidance, not retried as an OS permission prompt.

An allowed result still requires a delivery owner to re-read consent/capability at send time, authorize the event and recipient, deduplicate it, persist delivery state, and apply provider-specific retry/audit behavior. Sensitive previews remain redacted unless an explicit `allow-sensitive` preference is supplied.
