const { existsSync, rmSync } = require("node:fs")
const { join } = require("node:path")

/** @param {import("electron-builder").AfterPackContext} context */
module.exports = async function afterPack(context) {
  if (process.env.DOOREI_SLIM_UPDATE !== "1") return
  const product = context.packager.appInfo.productFilename
  const resources =
    context.electronPlatformName === "darwin"
      ? join(context.appOutDir, `${product}.app`, "Contents", "Resources")
      : join(context.appOutDir, "resources")
  const models = join(resources, "models")
  if (existsSync(models)) rmSync(models, { recursive: true, force: true })
}
