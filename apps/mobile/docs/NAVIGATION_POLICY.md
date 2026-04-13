# Mobile Navigation Policy

## Purpose

This document defines how mobile routes in `apps/mobile` should participate in navigation history.

The current problem is not just incorrect routing targets. The app mixes:

1. content navigation that should create back history
2. state transitions that should replace history
3. transient gate screens that should not remain swipe-back reachable

This policy gives developers a simple rule set for choosing `push`, `replace`, `navigate`, or a gate-driven redirect.

## Core Terms

### Push route

Use `router.push()` when the destination is a drill-in screen the user should be able to swipe back from.

### Replace route

Use `router.replace()` when the destination supersedes the current screen and the previous screen is no longer valid.

### Root destination

Use `router.navigate()` for tabs and other root destinations when the intent is to switch app areas, not create history.

Do not use `router.push()` for tab switches.

### Gate-owned route

Some routes should be entered only by auth/bootstrap logic, not by arbitrary feature code.

Examples:

1. `/(external)/verify`
2. `/(external)/callback`
3. `/(internal)/(standard)/onboarding`

## Default Rules

1. Use `push` for detail and drill-in screens.
2. Use `replace` for auth-state changes, success handoffs, and one-way flow steps.
3. Use `navigate` for tab roots and other root destinations.
4. Let `AppBootstrapGate` own auth-boundary redirects.
5. Disable back gestures on transient screens that should never be revisited by swipe-back.
