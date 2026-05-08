# Ordinus

Minimum Electron shell for a local-first agent orchestration app.

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Project Setup

### Install

```bash
$ npm install
```

### Development

```bash
$ npm run dev
```

### Build

```bash
$ npm run typecheck
$ npm run lint
$ npm run build
```

## Architecture

- Electron main process owns local OS access, SQLite, and future runtime services.
- Preload exposes only the typed `window.ordinus` bridge.
- Renderer is a React UI with no direct Node, filesystem, process, or database access.
- SQLite is bootstrapped at Electron `userData/ordinus.db` with only the `app_meta` table.

## Package

```bash
# For windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux
```
