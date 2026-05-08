# Packaging And Release

Ordinus uses electron-builder for desktop packages. Local builds should stay easy, but release builds must be signed and traceable.

## Current Package Identity

- Product name: `Ordinus`
- App id: `com.idealabs.ordinus`
- Executable name: `ordinus`
- Publisher/author: `IdeaLabs`
- Package metadata: repository, bugs URL, homepage, license, keywords
- Icon source: `app/build/icon.svg`
- Platform icons: `app/build/icon.ico`, `app/build/icon.icns`, `app/build/icon.png`

## Build Commands

- `npm run build:unpack`: local unpacked smoke package.
- `npm run build:win:local`: Windows installer build with the local executable edit/sign workaround enabled.
- `npm run build:win`: normal Windows package build.
- `npm run release:win`: Windows release build, fails if signing is not configured.
- `npm run release:mac`: macOS release build, fails if signing is not configured.

## Windows Code Signing Plan

Production Windows artifacts must be signed. electron-builder signs automatically when the signing configuration is provided. Preferred release options:

1. Azure Trusted Signing for CI-based signing.
2. Standard code signing certificate stored as CI secret.
3. EV certificate for immediate reputation, used from a secure signing host or hardware token.

Do not keep `signAndEditExecutable: false` in the production config. That flag is only used by local scripts to work around Windows development machines where electron-builder cannot edit/sign the executable.

Release command:

```bash
npm run release:win
```

Required signing variables depend on the selected provider. For Azure Trusted Signing, use the Azure tenant/client/profile variables described by electron-builder.

## macOS Signing And Notarization Plan

macOS release builds should use Developer ID signing, hardened runtime, and Apple notarization. The config enables hardened runtime and notarization; notarization becomes active when Apple credentials are provided.

Preferred notarization credentials:

- `APPLE_API_KEY`
- `APPLE_API_KEY_ID`
- `APPLE_API_ISSUER`

Fallback credentials:

- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`

Release command:

```bash
npm run release:mac
```

## Entitlements

The app does not request camera, microphone, photos, documents, downloads, or automation entitlements. Keep entitlements minimal and add new entries only when a shipped feature requires them.

Current macOS entitlement:

- `com.apple.security.cs.allow-jit`

## References

- [electron-builder Windows code signing](https://www.electron.build/code-signing-win.html)
- [electron-builder macOS code signing](https://www.electron.build/code-signing-mac)
- [electron-builder macOS notarize config](https://www.electron.build/electron-builder.interface.macconfiguration)
- [electron-builder forceCodeSigning config](https://www.electron.build/configuration.html)
