# Update Documentation Command

## Purpose
Updates all relevant documentation files when code changes are made, ensuring documentation stays in sync with the codebase.

## When to Invoke
- After implementing new features
- When architectural changes are made
- When API endpoints change
- When new patterns are introduced
- When critical bugs are fixed that require documentation
- User explicitly requests documentation update

## What This Command Does

1. **Identifies which documentation needs updating:**
   - CLAUDE.md - If architectural changes were made
   - README files - If new features were added
   - Component READMEs - If new patterns were introduced
   - API documentation - If tRPC routers changed
   - Migration guides - If breaking changes occurred

2. **Updates documentation systematically:**
   - Reads existing documentation
   - Identifies sections that need updates
   - Updates with new information
   - Ensures consistency with codebase
   - Updates examples if needed

3. **Verifies documentation quality:**
   - Checks for broken links
   - Verifies code examples compile
   - Ensures formatting consistency
   - Validates completeness

## Process

### Step 1: Analyze Changes
- Review git diff to understand what changed
- Identify which features/APIs were added/modified
- Determine documentation impact

### Step 2: Update CLAUDE.md
**When to update:**
- New package added to monorepo
- New development pattern adopted
- Architecture decision made
- Testing framework changed
- Build tooling updated

**Sections to update:**
- Project Overview - High-level architecture changes
- Monorepo Structure - New packages or reorganization
- Common Commands - New scripts or command changes
- Important Patterns - New patterns to follow
- Critical Don'ts - New pitfalls to avoid

### Step 3: Update README Files
**Package README:**
- Update API documentation for new functions
- Add usage examples
- Update installation steps if changed
- Document breaking changes

**App README (mobile/web):**
- Document new features
- Update setup instructions
- Add troubleshooting for new issues
- Update environment variables

### Step 4: Update Component Documentation
**For new components:**
- Create component README if it's a major feature
- Document props and usage
- Add examples
- Note any gotchas

**For modified components:**
- Update existing documentation
- Note breaking changes
- Update examples

### Step 5: Update API Documentation
**For tRPC routers:**
- Document new procedures
- Update input/output schemas
- Add usage examples
- Note authentication requirements

### Step 6: Create Migration Guides
**For breaking changes:**
- Document what changed
- Explain why it changed
- Provide before/after examples
- List migration steps

## Documentation Standards

### Clarity
- Use clear, concise language
- Avoid jargon unless necessary
- Define technical terms
- Use active voice

### Examples
- Include working code examples
- Test examples actually work
- Show common use cases
- Include edge cases if relevant

### Structure
- Use consistent heading hierarchy
- Use bullet points for lists
- Use code blocks for code
- Use tables for comparisons

### Completeness
- Document all public APIs
- Include all required parameters
- Note optional parameters
- Explain return values

## Example Workflow

### Scenario: Added New Recording Metric

1. **Identify changes:**
   - Added `cadence` to SessionStats
   - Added UI component for cadence display
   - Updated ActivityRecorder service

2. **Update CLAUDE.md:**
   - Add cadence to "Recording Service" section
   - Note new metric in key features

3. **Update mobile README:**
   - Document new cadence feature
   - Add screenshot if applicable

4. **Update ActivityRecorder documentation:**
   - Document new `cadence` property
   - Add usage example
   - Note any requirements (sensor needed)

5. **Verify:**
   - Check all links work
   - Test code examples
   - Review for completeness

## Templates

### Feature Documentation Template
```markdown
## Feature Name

### Overview
Brief description of what the feature does (1-2 sentences).

### Usage
\`\`\`typescript
// Code example showing basic usage
\`\`\`

### API
- **Input:** Description of inputs
- **Output:** Description of outputs

### Examples
\`\`\`typescript
// Common use case 1
// Common use case 2
\`\`\`

### Notes
- Important consideration 1
- Important consideration 2
```

### Breaking Change Documentation Template
```markdown
## Breaking Change: [Change Name]

### What Changed
Description of what changed.

### Why
Explanation of why this change was necessary.

### Migration
#### Before
\`\`\`typescript
// Old code
\`\`\`

#### After
\`\`\`typescript
// New code
\`\`\`

### Affected Components
- Component 1
- Component 2
```

## Verification Checklist

After updating documentation:

- [ ] All code examples work
- [ ] All links are valid
- [ ] Formatting is consistent
- [ ] No typos or grammatical errors
- [ ] New features are documented
- [ ] Breaking changes are noted
- [ ] Migration guides are clear
- [ ] Screenshots are up-to-date (if applicable)

## Files Typically Updated

### Always Check
- `CLAUDE.md` (project-level changes)
- Package `README.md` files
- API documentation

### Sometimes Check
- Component READMEs
- Migration guides
- Troubleshooting guides
- Setup instructions

### Rarely Check
- License files
- Contributing guidelines
- Code of conduct

## Critical Don'ts

- ❌ Don't update documentation without understanding the code changes
- ❌ Don't include outdated examples
- ❌ Don't skip testing code examples
- ❌ Don't create broken links
- ❌ Don't use placeholder text (TODO, lorem ipsum)
- ❌ Don't document internal/private APIs in public docs
- ❌ Don't skip documenting breaking changes

## Success Criteria

Documentation update is successful when:

1. ✅ All new features are documented
2. ✅ All code examples work
3. ✅ No broken links exist
4. ✅ Breaking changes are clearly marked
5. ✅ Migration guides are provided for breaking changes
6. ✅ Documentation is consistent with code
7. ✅ User can understand and use new features from docs

## Related Commands

- `/evaluate-repository` - Evaluate codebase quality
- `/create-test-suite` - Generate tests for new features

## Notes

- Documentation should be treated like code (review, test, version control)
- Update documentation in the same PR as code changes
- Keep documentation close to code (co-located when possible)
- Documentation debt is technical debt
