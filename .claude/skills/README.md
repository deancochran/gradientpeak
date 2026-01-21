# GradientPeak Skills System

## Overview

The Skills System is a self-improving knowledge framework that captures and enforces GradientPeak's specific best practices, coding conventions, and architectural patterns. Skills are living documents that evolve with the codebase.

## Purpose

- **Consistency**: Ensure all agents follow established patterns
- **Quality**: Codify best practices for automatic enforcement
- **Learning**: Capture institutional knowledge as the project evolves
- **Efficiency**: Reduce corrections by providing clear conventions upfront

## Skill Categories

### 1. Mobile Frontend Skill (`mobile-frontend-skill.md`)
React Native patterns, NativeWind styling, React Native Reusables components, mobile-specific patterns.

### 2. Web Frontend Skill (`web-frontend-skill.md`)
Next.js App Router, Server/Client components, shadcn/ui patterns, Tailwind CSS conventions.

### 3. Backend Skill (`backend-skill.md`)
tRPC router patterns, Supabase integration, API design, error handling.

### 4. Core Package Skill (`core-package-skill.md`)
Pure function patterns, Zod schemas, database independence, calculation functions.

### 5. Testing Skill (`testing-skill.md`)
Test structure, mocking patterns, coverage requirements, testing frameworks.

### 6. Documentation Skill (`documentation-skill.md`)
JSDoc standards, README formats, comment conventions, API documentation.

## Skill Structure

Each skill file follows this structure:

```markdown
# [Domain] Skill

**Last Updated**: YYYY-MM-DD
**Version**: X.Y.Z
**Maintained By**: Skill Creator Agent

## Core Principles
[High-level philosophy]

## Patterns to Follow
[Established conventions with examples]

## Anti-Patterns to Avoid
[Common mistakes with corrections]

## Code Examples
[Real examples from codebase]

## Checklist
[Quick reference for implementation]
```

## Usage in Agent Workflows

### Complex Tasks (With Skill Read)
```
USER → PRIMARY INTERFACE → DELEGATING AGENT
  → DELEGATING reads relevant skills
  → Spawns IMPLEMENTATION AGENT
  → AGENT reads skills before coding
  → Implementation follows skill conventions
  → Validation against skill checklist
```

## Integration with Existing Rules

Skills complement but do not replace the existing `.claude/rules/` documentation:

- **Rules** (`.claude/rules/`): Architectural constraints, critical principles
- **Skills** (`.claude/skills/`): Practical patterns, code conventions

**Relationship**: Rules define WHAT and WHY, Skills define HOW and WHEN

---

**Status**: Initial setup complete. Skill files are being generated.
