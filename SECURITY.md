# Security Policy

Ordinus is a local-first desktop app that will eventually run local AI provider CLIs. Security issues can affect user files, workspaces, credentials, and local processes.

## Supported Versions

The project is pre-release. Security fixes target the latest `main` branch until versioned releases begin.

## Reporting A Vulnerability

Please do not report security vulnerabilities through public issues.

Use GitHub private vulnerability reporting when it is enabled for the repository. If private reporting is not available yet, contact the maintainers through the repository owner and share only the minimum detail needed to establish a private channel.

Helpful information:

- Affected commit or version.
- Operating system.
- Reproduction steps.
- Impact and affected files, credentials, process execution, or workspace boundary.
- Any suggested fix or mitigation.

## Security Expectations

- Renderer must not access filesystem, process, SQLite, or secrets directly.
- Provider CLI execution must stay in the Electron main process.
- Secrets must not be stored in plaintext SQLite tables.
- Logs must redact secret values before writing.
- Workspace boundaries must be validated before process execution.

See `docs/provider-runtime-contract.md` and `docs/architecture.md` for the current security model.
