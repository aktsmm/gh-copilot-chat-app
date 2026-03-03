# Contributing

## Prerequisites

- Node.js 20+
- GitHub Copilot CLI installed and authenticated (`copilot auth login`)

## Local Development

1. Install dependencies
   - `npm install`
2. Run startup preflight checks
   - `npm run preflight`
3. Start development servers
   - `npm run dev`

## Validation Before PR

- `npm run typecheck`
- `npm run smoke:vite-server-url`
- `npm run build -w client`
- `npm run build -w server`
