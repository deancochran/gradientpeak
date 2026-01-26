# Design: Configuration Standards Update

## Overview

Update the Opencode agent configuration to follow the new standardized structure for change logging, documentation, and agent configurations.

## Goals

- Update AGENTS.md to reflect actual project structure
- Update tasks/index.md to use new format (design.md, plan.md, tasks.md)
- Create .opencode/specs/ directory structure
- Remove outdated directory references from agent documentation

## Non-Goals

- Making changes to application code
- Modifying build configuration
- Updating documentation outside .opencode/

## Background

The existing configuration files contain references to directories that don't match the actual project structure. This update standardizes the configuration to match the prompt.md guidelines.
