# Enterprise Challenge Docs

## Problem
Teams need a standardized, deployable Copilot chat experience beyond ad-hoc CLI usage.

## Solution
gh-copilot-chat-app provides a desktop-first, multi-session, policy-aware chat interface powered by Copilot SDK/CLI.

## Prerequisites
- Node.js 20+
- GitHub Copilot CLI installed and authenticated
- Copilot subscription (or BYOK setup)

## Setup
- End-user: install Copilot CLI, login, run desktop installer from Releases
- Developer: `npm install && npm run preflight && npm run dev`

## Deployment
Desktop artifacts are built and published through GitHub Actions release workflow.

## Architecture

```
┌─────────────────────────────────────────────────┐
│           Electron Desktop App                   │
│  ┌──────────┐    Socket.IO     ┌─────────────┐  │
│  │  React   │ ◄──────────────► │  Express     │  │
│  │  Client  │   streaming      │  Server      │  │
│  └──────────┘                  └──────┬──────┘  │
│                                       │          │
│                              child_process       │
│                                       │          │
│                                ┌──────▼──────┐  │
│                                │ Copilot CLI  │  │
│                                │ (SDK runtime)│  │
│                                └──────┬──────┘  │
└───────────────────────────────────────┼─────────┘
                                        │
                                   GitHub API
                                        │
                                ┌───────▼───────┐
                                │  GitHub       │
                                │  Copilot      │
                                │  (AI Models)  │
                                └───────────────┘
```

- **Client**: React 19 + TypeScript — multi-session chat UI with model/mode/tool-policy controls
- **Server**: Express + Socket.IO — manages Copilot CLI child processes, streams responses
- **Desktop**: Electron wrapper — packaged for Windows/macOS/Linux distribution
- **Copilot CLI**: SDK runtime spawned per session — handles auth, model routing, tool execution

## Responsible AI & Security Notes
- Principle of least privilege for tool usage
- Clear operator prerequisites and controlled runtime path
- No secrets committed to repository (`.env.example` provided, `.env` gitignored)
- CI checks (lint, typecheck, unit tests, smoke test) before release
- Desktop installer distributed via GitHub Releases with SHA256 checksums
