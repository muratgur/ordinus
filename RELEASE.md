# Cutting a Release — Quick Guide

Shipping a new version takes **one command**. Run it from the repo root:

```bash
npm run release patch     # 0.2.4 → 0.2.5  (bug fixes)
npm run release minor     # 0.2.4 → 0.3.0  (new features)
npm run release major     # 0.2.4 → 1.0.0  (breaking changes)
npm run release 0.2.5     # set an explicit version
```

The command, in order:

1. Updates the version in **all six places** (root + `app/`, each with its
   `package.json` and `package-lock.json`).
2. Creates a `chore: release vX.Y.Z` commit and a `vX.Y.Z` tag.
3. **Asks for confirmation before pushing** (`y/N`). On yes, it pushes the tag.

Pushing the tag triggers GitHub Actions, which builds the macOS + Windows
artifacts and publishes them on the
[Releases](https://github.com/muratgur/ordinus/releases) page (~10–15 min).

## The working tree must be clean first

So unrelated changes don't end up in the release commit, the command requires a
**clean git tree**. Commit (or stash) your pending changes first:

```bash
git status            # see what's there
git commit -am "..."  # or: git stash
```

## Useful flags

```bash
npm run release -- --dry-run patch   # show what WOULD happen, touch nothing
npm run release -- --yes patch       # skip the push confirmation, push directly
```

Use `--dry-run` to preview any time — no file, commit, tag, or push is changed.

## If something goes wrong

**Before** the push (commit + tag created but not yet pushed):

```bash
git tag -d vX.Y.Z          # delete the tag
git reset --hard HEAD~1    # undo the release commit
```

The command prints these exact commands when you decline the push.

## More detail

For build targets, code signing, the CI pipeline, and more, see
[`docs/packaging-release.md`](docs/packaging-release.md).
Automation script: [`scripts/release.mjs`](scripts/release.mjs).
