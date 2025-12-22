---
description: Create roadmap with phases for the project
---
<objective>
Create project roadmap with phase breakdown.

Roadmaps define what work happens in what order. Run after /prompts:gsd-new-project.
</objective>

<execution_context>
Read file: ~/.codex/get-shit-done/workflows/create-roadmap.md
Read file: ~/.codex/get-shit-done/templates/roadmap.md
Read file: ~/.codex/get-shit-done/templates/state.md
</execution_context>

<context>
Read file: .planning/PROJECT.md
Read file: .planning/config.json
</context>

<process>

<step name="validate">
```bash
# Verify project exists
[ -f .planning/PROJECT.md ] || { echo "ERROR: No PROJECT.md found. Run /prompts:gsd-new-project first."; exit 1; }
```
</step>

<step name="check_existing">
Check if roadmap already exists:

```bash
[ -f .planning/ROADMAP.md ] && echo "ROADMAP_EXISTS" || echo "NO_ROADMAP"
```

**If ROADMAP_EXISTS:**
Use AskUserQuestion:
- header: "Roadmap exists"
- question: "A roadmap already exists. What would you like to do?"
- options:
  - "View existing" - Show current roadmap
  - "Replace" - Create new roadmap (will overwrite)
  - "Cancel" - Keep existing roadmap

If "View existing": `cat .planning/ROADMAP.md` and exit
If "Cancel": Exit
If "Replace": Continue with workflow
</step>

<step name="create_roadmap">
Follow the create-roadmap.md workflow starting from detect_domain step.

The workflow handles:
- Domain expertise detection
- Phase identification
- Research flags for each phase
- Confirmation gates (respecting config mode)
- ROADMAP.md creation
- STATE.md initialization
- Phase directory creation
- Git commit
</step>

<step name="done">
```
Roadmap created:
- Roadmap: .planning/ROADMAP.md
- State: .planning/STATE.md
- [N] phases defined

---

## ▶ Next Up

**Phase 1: [Name]** — [Goal from ROADMAP.md]

`/prompts:gsd-plan-phase 1`

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- `/prompts:gsd-discuss-phase 1` — gather context first
- `/prompts:gsd-research-phase 1` — investigate unknowns
- Review roadmap

---
```
</step>

</process>

<output>
- `.planning/ROADMAP.md`
- `.planning/STATE.md`
- `.planning/phases/XX-name/` directories
</output>

<success_criteria>
- [ ] PROJECT.md validated
- [ ] ROADMAP.md created with phases
- [ ] STATE.md initialized
- [ ] Phase directories created
- [ ] Changes committed
</success_criteria>
