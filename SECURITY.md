# GradientPeak Security Policy

## Supported scope

GradientPeak is currently in private pre-production development. This policy applies to the active GradientPeak repository, including the web app, mobile app, shared packages, backend API code, and supporting development workflow files.

Production release support is not defined yet. A production support policy will be documented after an approved production release plan exists.

## Reporting a vulnerability

Please report suspected vulnerabilities through a private channel. Do **not** disclose vulnerability details in public GitHub issues, public pull request comments, Plane work items or comments, chat excerpts, logs, or other public surfaces.

Preferred reporting path:

1. Use GitHub private vulnerability reporting or a repository security advisory when that option is available for this repository.
2. If GitHub private reporting is not available, contact the maintainer through the approved private channel already established with the project owner.

Do not publish unapproved private contact details, secrets, credentials, tokens, personal data, exploit payloads, or raw sensitive logs in repository files or public discussion.

## What to include

When reporting, include enough detail for maintainers to reproduce and assess the issue while keeping sensitive material redacted:

- A concise vulnerability summary.
- The affected component, package, app, branch, commit, or version if known.
- Reproduction steps or proof-of-concept details that avoid exposing live secrets or third-party data.
- Expected and actual behavior.
- Security impact, severity, and affected users or data classes if known.
- Redacted screenshots, stack traces, or log excerpts when useful.
- Suggested remediation or mitigations if known.

Never include raw tokens, passwords, API keys, session cookies, personally identifiable information, private customer data, or unredacted sensitive logs.

## Maintainer handling

GradientPeak maintainers will handle security reports through private remediation channels:

1. Acknowledge the report when it is received through an approved private path.
2. Triage severity, affected surfaces, and exploitability.
3. Create private remediation work with only public-safe summaries in Plane or GitHub when public tracking is needed.
4. Implement and verify the fix on the appropriate development branch.
5. Coordinate disclosure, advisories, release notes, or public follow-up only after explicit approval.

## Branching and release expectations

Normal security fixes target `dev` first, following the current GradientPeak Plane-first SDLC. Changes to `main`, tags, production releases, and deployments remain human-gated unless an explicit urgent hotfix or release plan is approved.

Security policy updates should use focused branches and pull requests that include the related Plane identifier when applicable.
