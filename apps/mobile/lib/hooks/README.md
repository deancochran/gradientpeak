# Mobile Hooks

This folder contains shared mobile hooks, including form and mutation helpers.

## Current note

`useReliableMutation` is the main app-wide mutation wrapper for common mobile flows.

Use it when a screen needs the usual behavior in one place:

- success messaging
- shared error handling
- cache invalidation
- screen-specific follow-up logic through callbacks

## Keep in mind

- Put generic mutation behavior in the hook.
- Keep screen routing, modal state, and product copy in the consuming screen.
- Prefer concise examples in code and tests over maintaining a long migration guide here.
