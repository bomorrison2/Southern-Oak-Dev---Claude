# CLAUDE_NOTES.md

## Current purpose
This repository is a Claude-only workspace for Southern Oak / Dashlands experiments, prototypes, refactors, and alternative implementations.

It is intentionally separate from the main Codex working repository.

## Important rule
Do not try to make this repo match the main Codex repo automatically.

This repo is allowed to diverge.
The human owner will decide what gets copied back.

## Current priorities
1. Keep work isolated and reviewable
2. Avoid broad rewrites unless requested
3. Prefer focused changes in a small number of files
4. Preserve working behaviour unless change is requested
5. Make outputs easy to inspect and manually transfer

## Good uses for this repo
- architecture experiments
- UI alternatives
- generator/scoring prototypes
- safer refactors
- isolated feature work
- documentation and planning notes

## Avoid
- touching unrelated files
- deleting working code just to “clean up”
- changing repo structure without good reason
- assuming this repo should be synced with another repo
- introducing dependency bloat without justification

## Human preferences
- clear structure
- readable code
- practical solutions
- minimal disruption
- explain what changed and why
- optimise for safe manual review

## If starting a task
Before changing code:
1. inspect the relevant files
2. identify the smallest sensible change
3. explain the proposed approach
4. make focused edits
5. summarise files changed, purpose, and risks

## Definition of done
A task is done when:
- the requested change is implemented
- only relevant files were changed
- the result is understandable
- assumptions are stated clearly
- the human can review and selectively reuse it