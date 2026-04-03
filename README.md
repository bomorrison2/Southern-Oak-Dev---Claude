# Southern-Oak-Dev — Claude Workspace

## Purpose

This repository is a **Claude-only development workspace** for the Southern Oak / Dashlands planning tool.

It exists separately from the main Codex / VS Code working repository so that Claude can work independently without creating conflicts, overwriting files, or interfering with the main development flow.

This repo should be treated as a **parallel sandbox / implementation branch in repository form**, not the master source of truth.

---

## Core Rule

**Do not attempt to sync, merge, rebase, or automatically align this repository with the Codex working repository unless explicitly instructed by the human owner.**

Changes made here are to be treated as:
- isolated experiments
- alternative implementations
- feature prototypes
- UI or architecture drafts
- safe refactors for review

The human owner will decide what is copied back into the main working repo.

---

## Main Goal

Use this repository to help build and improve the Southern Oak planning tool, including:

- site layout generation
- planning and feasibility logic
- geometry tools
- scoring systems
- DXF / PDF workflows
- UI improvements
- framework-led site planning logic
- architect-style layout generation
- supporting utilities and documentation

---

## Working Principles

### 1. Protect separation
This repo must remain separate from the Codex / VS Code repo.

Claude must **not**:
- assume both repositories should match
- try to "repair" differences between repos
- delete work just because it differs from another version
- overwrite files only to make this repo resemble another workspace

### 2. Make focused changes
Each task should be handled with the smallest sensible set of edits.

Prefer:
- targeted fixes
- modular additions
- safe refactors
- clearly scoped file changes

Avoid:
- broad rewrites unless specifically requested
- changing unrelated files
- reformatting large areas without need
- renaming files or folders without reason

### 3. Preserve working behaviour
When refactoring:
- keep existing behaviour working unless a change is requested
- avoid introducing speculative improvements that may break the app
- maintain compatibility with current project structure wherever practical

### 4. Explain intent clearly
For every meaningful change, Claude should be able to explain:
- what was changed
- why it was changed
- which files were touched
- what the expected result is
- any risks or assumptions

### 5. Prefer reviewable outputs
Claude should favour work that is easy for a human to inspect and selectively copy into the main repo later.

That means:
- clean file structure
- readable code
- sensible comments
- no hidden magic
- no unnecessary churn

---

## Development Style

### Code style
- Write clear, production-leaning code
- Prefer readability over cleverness
- Keep logic modular
- Use descriptive names
- Add comments where logic is non-obvious
- Avoid unnecessary abstraction

### UI style
- Keep the interface practical, clear, and tool-like
- Prioritise usability over decoration
- Make planning, editing, and review workflows obvious
- Avoid overdesigned or gimmicky interactions

### Architecture style
Prefer separation into logical modules such as:
- geometry
- generator
- scoring
- metrics
- import/export
- UI/editor
- utilities

---

## Change Safety Rules

Before making changes, Claude should try to avoid:
- breaking DXF import/export
- breaking API routes
- breaking frontend startup
- changing environment setup without reason
- introducing dependency bloat unless justified

When possible, changes should preserve:
- local dev startup
- existing endpoints
- current file/folder conventions
- ability to test parts independently

---

## Git / Commit Guidance

Commits in this repo should be:
- small
- focused
- descriptive

Preferred commit style:
- `Fix DXF boundary parsing message`
- `Refactor generator into modular scoring pipeline`
- `Add framework-led parcel generation prototype`
- `Improve editor import panel and calibration flow`

Avoid vague commits like:
- `updates`
- `stuff`
- `fixes`
- `changes`

---

## Definition of Done

A task is considered complete when:

1. the requested change is implemented
2. only relevant files were changed
3. the result is understandable and reviewable
4. no unrelated regressions were introduced knowingly
5. assumptions or limitations are stated clearly

---

## Special Repo Policy

This repository is intentionally separate from the main working repo.

That means:

- this repo is allowed to diverge
- experiments are allowed here
- alternative approaches are allowed here
- partial implementations are allowed here
- comparison work is allowed here

But Claude must always treat that separation as intentional, not as a problem to fix.

---

## Human Owner Preferences

The owner prefers:

- clear, structured work
- practical problem-solving
- minimal unnecessary disruption
- readable code
- no needless rewrites
- no guessing when the codebase itself provides the answer
- preserving stable working paths while improving the system in steps

---

## Recommended Claude Behaviour

When tackling a task, Claude should generally:

1. inspect the relevant files first
2. understand the existing structure before editing
3. identify the smallest viable change
4. implement cleanly
5. summarise what changed and any caveats

For larger features, Claude should first outline:
- proposed approach
- files likely to change
- risks
- implementation order

---

## Current Intent for This Repo

This Claude repo is best used for:
- experiments
- feature branches in spirit
- architectural alternatives
- safer isolated prototyping
- work that may later be manually copied into the main Codex repo

It is **not** the source of truth unless the human owner explicitly says so.

---

## Final Instruction

When in doubt:

**protect separation, make focused changes, and optimise for safe human review and selective transfer back into the main repo.**
