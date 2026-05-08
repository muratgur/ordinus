# Ordinus

Ordinus is a desktop workspace for coordinating AI agents around real software work. It is built as a local-first Electron app with a secure main/preload/renderer boundary and a minimal SQLite foundation.

The repository root contains product guidance, project skills, and documentation. The Electron application lives in `app/`.

## Quick Start

Use Node.js `22.13.0` or newer. If you use `nvm` or `fnm`, run:

```bash
nvm use
```

```bash
cd app
npm install
npm run dev
```

## Common Commands

Run these from `app/`:

```bash
npm ci
npm run typecheck
npm run lint
npm run build
npm run build:win
npm run build:win:local
```

Generate SQLite migrations after changing the Drizzle schema:

```bash
npm run db:generate
```

UI primitives are managed with shadcn/ui:

```bash
npm run ui:info
npm run ui:check
npm run ui:add -- button
```

## Repository Layout

```text
.
|-- AGENTS.md
|-- CONTRIBUTING.md
|-- SECURITY.md
|-- LICENSE
|-- .github/workflows/
|-- .github/ISSUE_TEMPLATE/
|-- .codex/skills/
|-- docs/
`-- app/
    |-- src/main/
    |-- src/preload/
    |-- src/renderer/
    `-- src/shared/
```

## Product Direction

Ordinus should feel like a calm command center for AI-assisted work. Keep agent activity visible, preserve user control, and avoid adding broad integrations before the core local runtime is stable.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request and [SECURITY.md](SECURITY.md) for private vulnerability reporting.

## License

Ordinus is licensed under the [MIT License](LICENSE).

See [docs/product-brief.md](docs/product-brief.md), [docs/architecture.md](docs/architecture.md), [docs/migration-strategy.md](docs/migration-strategy.md), [docs/provider-runtime-contract.md](docs/provider-runtime-contract.md), [docs/packaging-release.md](docs/packaging-release.md), and [AGENTS.md](AGENTS.md) before making product or architecture changes.
