import {
  providerByKindFromVault,
  providerConfigFromFields,
  providerVaultFromFields
} from "../providerConfig.js"
import type { Library } from "../types.js"
import type { LibraryCore } from "./core.js"

export function settingsApi(core: LibraryCore): Pick<
  Library,
  "chooseAppLanguage" | "configureProvider" | "updateSettings" | "setActivity"
> {
  const { state } = core
  return {
    async chooseAppLanguage(language) {
      state.appLanguage = language
      if (core.modelsComplete()) {
        state.gatePassed = true
      }
      core.emit({ kind: "app" })
    },
    async configureProvider(configOrKind, vaultOrByKind) {
      if (typeof configOrKind === "string") {
        const byKind = {
          ...providerByKindFromVault(state.providerVault),
          ...(vaultOrByKind ?? {})
        }
        state.providerVault = providerVaultFromFields(byKind)
        state.provider = providerConfigFromFields({ kind: configOrKind, byKind })
        core.emit({ kind: "app" })
        return
      }
      const config = configOrKind
      const vault = vaultOrByKind as typeof state.providerVault | undefined
      if (vault) {
        state.providerVault = { ...vault }
      } else if (config) {
        const { kind, ...fields } = config
        state.providerVault = { ...state.providerVault, [kind]: fields }
      }
      state.provider = config
      core.emit({ kind: "app" })
    },
    async updateSettings(patch) {
      core.assertUsable()
      state.settings = { ...state.settings, ...patch }
      core.emit({ kind: "app" })
    },
    async setActivity(activity) {
      core.assertUsable()
      state.activity = activity
      core.emit({ kind: "app" })
    }
  }
}
