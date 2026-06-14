// ADR-047: assert the bundled Node binary actually made it into the packaged app.
//
// electron-builder SILENTLY SKIPS a missing `extraResources` source instead of
// failing the build. If the beforePack hook ever fails to populate
// resources/runtime/node, the app would ship with no bundled Node and the bug
// this whole change fixes (CLI/npm can't find `node`) would silently return.
// This guard turns that into a loud build failure.

const { existsSync } = require('node:fs')
const { join } = require('node:path')

module.exports = async function afterPack(context) {
  const { appOutDir, electronPlatformName } = context
  const binName = electronPlatformName === 'win32' ? 'node.exe' : 'node'

  const resourcesDir =
    electronPlatformName === 'darwin'
      ? join(appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
      : join(appOutDir, 'resources')

  const nodeBin = join(resourcesDir, 'runtime', 'node', binName)
  if (!existsSync(nodeBin)) {
    throw new Error(
      `ADR-047: bundled Node is missing from the packaged app at ${nodeBin}. ` +
        'The beforePack hook must have failed to download/extract it. Refusing to ship ' +
        'an app that cannot install or run the provider CLIs.'
    )
  }
  console.log(`[ADR-047] verified bundled Node in package: ${nodeBin}`)
}
