# Packaging And Release

Ordinus uses electron-builder to package the desktop app and GitHub Actions to publish releases automatically.

## Package Identity

- Product name: `Ordinus`
- App id: `com.muratgur.ordinus`
- Executable name: `ordinus`
- Publisher/author: `Murat Gür`
- Icon source: `app/build/icon.svg`
- Platform icons: `app/build/icon.ico`, `app/build/icon.icns`, `app/build/icon.png`

## Supported Targets

The automated release pipeline builds two artifacts:

| Platform | Architecture | Artifact |
|---|---|---|
| macOS | arm64 (Apple Silicon) | `Ordinus-<version>-mac-arm64.dmg` |
| Windows | x64 | `ordinus-<version>-setup.exe` |

Linux and Intel macOS builds are not produced. Contributors on those platforms can build locally from source.

## Local Build Commands

Run these from `app/`:

- `npm run build:unpack` — local unpacked smoke package.
- `npm run build:mac` — macOS `.dmg` build.
- `npm run build:win` — Windows installer build.
- `npm run build:win:local` — Windows installer build with the local executable edit/sign workaround enabled (use this on machines where electron-builder cannot edit/sign the executable).

Output appears under `app/dist/`.

## Code Signing

Builds are currently **unsigned** on both platforms. Users see an OS warning on first launch (Gatekeeper on macOS, SmartScreen on Windows) and confirm manually.

When signing becomes worthwhile, both `app/electron-builder.yml` and `.github/workflows/release.yml` will need updates:

- **macOS**: re-enable `hardenedRuntime`, `notarize`, add Apple Developer credentials as GitHub Actions secrets, restore `entitlements`.
- **Windows**: provide a signing certificate (Azure Trusted Signing, standard, or EV) and remove `signAndEditExecutable: false` from the release command.

## Release Workflow

Releases are tag-driven. Pushing a `v*` tag triggers `.github/workflows/release.yml`, which:

1. Builds the macOS and Windows artifacts in parallel.
2. Uploads them as workflow artifacts.
3. Creates a GitHub Release at that tag and attaches the `.dmg` and `.exe` files. Release notes are auto-generated from commits.

### Cutting a release

```bash
# 1. Bump version in both package.json files (root and app/).
# 2. Commit.
git commit -am "chore: bump to v0.2.0"

# 3. Tag and push.
git tag v0.2.0
git push --follow-tags
```

The workflow takes ~10–15 minutes. Watch progress under the repository **Actions** tab; the release appears under **Releases** when the job completes.

## Updates

Auto-update is not enabled. Users download new versions manually from the [Releases](https://github.com/muratgur/ordinus/releases) page. Installing over an existing version is supported by both `.dmg` (drag-to-Applications replaces the prior app) and the NSIS installer (uninstalls the old version first).

## References

- [electron-builder configuration](https://www.electron.build/configuration.html)
- [electron-builder Windows code signing](https://www.electron.build/code-signing-win.html)
- [electron-builder macOS code signing](https://www.electron.build/code-signing-mac)
- [softprops/action-gh-release](https://github.com/softprops/action-gh-release)
