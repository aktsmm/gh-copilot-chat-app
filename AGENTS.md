# AGENTS.md

## Purpose

Enterprise-ready Copilot SDK chat app pattern for reusable deployment.

## Rules

- Keep changes minimal and production-oriented.
- Avoid broad tool permissions.
- Document operational impact in README/docs.
- Treat `.github/agents/`, `.github/instructions/`, and `.github/review-learnings.md` as local-only assets (ignored from git by design).
- Fail fast at task start by checking repository/branch and dirty state before edits.
- Separate concerns across planning, implementation, and release operations; avoid one actor owning all phases.

## Validation

- npm run preflight
- npm run typecheck
- npm run build
