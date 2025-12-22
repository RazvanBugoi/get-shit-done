---
description: Analyze codebase and produce .planning/codebase/ documents
argument-hint: "[optional: specific area to map, e.g., 'api' or 'auth']"
---
<objective>
Analyze existing codebase and produce structured codebase documents.

If the `get-shit-done-codex` wrapper is available, use it to run parallel mapping via multiple `codex exec` processes.

Output: .planning/codebase/ folder with 7 structured documents about the codebase state.
</objective>

<execution_context>
Read file: ~/.codex/get-shit-done/templates/codebase/stack.md
Read file: ~/.codex/get-shit-done/templates/codebase/architecture.md
Read file: ~/.codex/get-shit-done/templates/codebase/structure.md
Read file: ~/.codex/get-shit-done/templates/codebase/conventions.md
Read file: ~/.codex/get-shit-done/templates/codebase/testing.md
Read file: ~/.codex/get-shit-done/templates/codebase/integrations.md
Read file: ~/.codex/get-shit-done/templates/codebase/concerns.md
</execution_context>

<context>
Focus area: $ARGUMENTS (optional - if provided, tells agents to focus on specific subsystem)

**Load project state if exists:**
Check for .planning/STATE.md - loads context if project already initialized

**This command can run:**
- Before /prompts:gsd-new-project (brownfield codebases) - creates codebase map first
- After /prompts:gsd-new-project (greenfield codebases) - updates codebase map as code evolves
- Anytime to refresh codebase understanding
</context>

<when_to_use>
**Use map-codebase for:**
- Brownfield projects before initialization (understand existing code first)
- Refreshing codebase map after significant changes
- Onboarding to an unfamiliar codebase
- Before major refactoring (understand current state)
- When STATE.md references outdated codebase info

**Skip map-codebase for:**
- Greenfield projects with no code yet (nothing to map)
- Trivial codebases (<5 files)
</when_to_use>

<process>
1. Check if .planning/codebase/ already exists (offer to refresh or skip)
2. Create .planning/codebase/ directory structure
3. If `get-shit-done-codex` is installed, run `get-shit-done-codex map-codebase` and exit.
4. Otherwise, analyze sequentially in this session and fill templates:
   - Stack + Integrations (technology focus)
   - Architecture + Structure (organization focus)
   - Conventions + Testing (quality focus)
   - Concerns (issues focus)
5. Write 7 codebase documents using templates:
   - STACK.md - Languages, frameworks, key dependencies
   - ARCHITECTURE.md - System design, patterns, data flow
   - STRUCTURE.md - Directory layout, module organization
   - CONVENTIONS.md - Code style, naming, patterns
   - TESTING.md - Test structure, coverage, practices
   - INTEGRATIONS.md - APIs, databases, external services
   - CONCERNS.md - Technical debt, risks, issues
6. Offer next steps (typically: /prompts:gsd-new-project or /prompts:gsd-plan-phase)
</process>

<success_criteria>
- [ ] .planning/codebase/ directory created
- [ ] All 7 codebase documents written
- [ ] Documents follow template structure
- [ ] Parallel agents completed without errors
- [ ] User knows next steps
</success_criteria>
