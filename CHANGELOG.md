# Changelog

Notable changes are recorded here. Implementation details and older work remain in Git history.

## Unreleased

### Developer experience

- Keep Git hooks limited to staged-file formatting and linting; pushes no longer repeat CI or start databases and browsers.
- Run database verification in its selected CI lane instead of also starting a database in the static-check lane.
- Remove the unused retained-E2E environment preparation script and its obsolete tests; keep disposable-target protection coverage.
- Consolidate onboarding in CONTRIBUTING and remove historical audit reports, captured lint output, and generated catalog review/export artifacts from source control.
- Preserve active product contracts, security checks, application tests, migrations, lockfiles, and generated runtime contracts.
