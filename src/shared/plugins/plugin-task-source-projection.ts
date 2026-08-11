import type {
  PluginTaskConnectionField,
  PluginTaskSourceContribution
} from './plugin-task-source-contribution'
import type { PluginTaskSourceFeature } from './plugin-task-source-methods'

/**
 * What clients learn about a contributed task source. Manifest facts only —
 * no connection values and never a credential; those stay on the runtime in
 * the plugin's settings store and encrypted vault.
 */
export type PluginTaskSourceProjection = {
  /** `plugin:<publisher>.<pluginId>/<sourceId>` — the `TaskProvider` value. */
  providerId: `plugin:${string}`
  pluginKey: string
  sourceId: string
  title: string
  /** Lucide icon name, or null to fall back to a generic source glyph. */
  icon: string | null
  features: readonly PluginTaskSourceFeature[]
  connectionFields: readonly PluginTaskConnectionField[]
}

export function projectPluginTaskSource(
  providerId: `plugin:${string}`,
  pluginKey: string,
  source: PluginTaskSourceContribution
): PluginTaskSourceProjection {
  return {
    providerId,
    pluginKey,
    sourceId: source.id,
    title: source.title,
    icon: source.icon ?? null,
    features: source.features,
    connectionFields: source.connectionFields
  }
}
