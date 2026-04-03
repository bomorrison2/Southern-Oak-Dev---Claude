# CLAUDE_NOTES.md

## Current purpose
This repository is a Claude-only workspace for Southern Oak / Dashlands experiments, prototypes, refactors, and alternative implementations.

It is intentionally separate from the main Codex / VS Code working repository.

## Important rule
Do not try to make this repo match the main Codex repo automatically.

This repo is allowed to diverge.
The human owner will decide what gets copied back.

## Current repo phase
This repo is currently in the **prototype reconstruction** phase.

The immediate goal is **not** to add major new features.

The immediate goal is to:
- reconstruct the current static prototype work into real files inside this repo
- organise it cleanly
- make it easy to review
- make it easy to run locally
- keep it isolated from the main app repo

## Current prototype scope
The prototype currently consists of four main pages described in chat history:

- `index.html` — landing page
- `editor.html` — interactive site editor prototype
- `designer.html` — AI brief generator prototype
- `projects.html` — saved projects dashboard using localStorage

This work should now be reconstructed cleanly inside the repository as actual files.

## Current priorities
1. Keep work isolated and reviewable
2. Rebuild the current prototype as real repo files
3. Avoid broad rewrites unless requested
4. Prefer focused changes in a small number of files
5. Preserve working behaviour unless change is requested
6. Make outputs easy to inspect and manually transfer

## Good uses for this repo
- architecture experiments
- UI alternatives
- generator/scoring prototypes
- safer refactors
- isolated feature work
- documentation and planning notes
- static prototype reconstruction
- local prototype polish

## Avoid
- touching unrelated files
- deleting working code just to “clean up”
- changing repo structure without good reason
- assuming this repo should be synced with another repo
- introducing dependency bloat without justification
- adding backend/auth/database work unless explicitly requested
- jumping to large framework rewrites before the prototype is properly reconstructed

## Preferred structure
A tidy structure is preferred over a messy single-file sprawl.

A sensible direction would be something like:

```text
prototype-static/
  index.html
  editor.html
  designer.html
  projects.html
  css/
    styles.css
  js/
    shared.js
    editor.js
    designer.js
    projects.js
  assets/