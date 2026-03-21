---
name: explaining-code
description: Explain code clearly with structure, examples, and lightweight diagrams when useful
---

# Explaining Code Skill

## When to Use

- Explaining how a function, component, hook, or service works
- Walking a user through data flow or architecture
- Teaching repo patterns in a concrete, code-linked way

## Scope

This skill is for explanation, not implementation.

- Prefer concrete repo examples over abstract theory.
- Use diagrams and analogies only when they improve clarity.

## Rules

1. Start with purpose and role in the system.
2. Explain flow in the order the code executes.
3. Link behavior to specific files or functions.
4. Prefer small ASCII diagrams over long prose when structure matters.
5. Explain why a pattern exists, not just what it does.

## Default Structure

1. What it is
2. Inputs and outputs
3. Step-by-step flow
4. Important constraints or edge cases
5. Related files or patterns

## Example Pattern

```text
ActivityRecorderService
  -> receives user actions
  -> coordinates GPS and sensor inputs
  -> updates session state
  -> persists local recording data
  -> hands results to sync/export flows
```

## Avoid

- repeating the entire file line by line
- using analogies when direct explanation is clearer
- skipping important constraints, state transitions, or failure paths

## Quick Checklist

- [ ] purpose explained first
- [ ] execution order made clear
- [ ] file/function references included
- [ ] constraints and edge cases covered
