# gh-copilot-chat-app

> Unofficial community project. Not affiliated with GitHub.

Modern Claude / ChatGPT-like chat interface powered by GitHub Copilot SDK.

![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)
![React](https://img.shields.io/badge/React-19-61dafb)
![Copilot SDK](https://img.shields.io/badge/Copilot_SDK-GA-22c55e)

## Language

- English (base): this file (`README.md`)
- 日本語: [README.ja.md](README.ja.md)

## Highlights

- Real-time streaming chat via Socket.IO
- Multi-session conversation management
- Per-session model / mode / tool policy controls
- Web-search fallback support for search-style prompts
- Electron desktop packaging (Windows/macOS/Linux)

## Requirements

1. Node.js 20+
2. GitHub Copilot CLI installed and authenticated
3. Valid Copilot subscription (or BYOK setup)

## Quick Start

```bash
npm install
npm run preflight
npm run dev
```

## Build

```bash
npm run build
npm start
```

## Desktop Build (Windows)

```bash
npm run build:desktop
```

Expected installer output:

- desktop/dist/GitHub Copilot Chat Setup <version>.exe

## Pre-release Checklist

1. Run quality checks
   - npm run typecheck
   - npm run test -w server
2. Rebuild desktop installer after latest source changes
3. Ensure secrets are not included (.env, tokens, local credentials)
4. Exclude temporary files and local artifacts from commits

## Release Assets (Recommended)

- Do not commit distributables (EXE) to the repository.
- Attach them as GitHub Release Assets.
- On `Release published`, [release-desktop-assets.yml](.github/workflows/release-desktop-assets.yml) builds and uploads:
  - GitHub Copilot Chat Setup <version>.exe
  - GitHub Copilot Chat Setup <version>.exe.blockmap
  - GitHub Copilot Chat <version>.exe (portable)
- For manual execution, use workflow_dispatch and provide `tag`.

## Notes

- Full Japanese guide: [README.ja.md](README.ja.md)
