import { useMemo } from 'react'
import type { PluginHostListEntry } from '../../../preload/api-types'
import type { PluginTaskSourceProjection } from '../../../shared/plugins/plugin-task-source-projection'
import { ensurePluginPanelsLoaded, usePluginPanelsStore } from './plugin-panels'

/**
 * Task sources contributed by installed plugins, derived from the plugin
 * registry the panels store already fetches — deliberately not a second fetch
 * or subscription.
 */

export type PluginTaskSource = PluginTaskSourceProjection & {
  pluginName: string
  /** False while the plugin is disabled, pending consent, or errored: the
   *  source stays listed in Settings but must not be offered in Tasks. */
  enabled: boolean
}

/** Statuses in which a worker can actually answer a provider call. Mirrors
 *  `collectActivePluginPanels` so a source and its panels agree on liveness. */
function isEnabledStatus(status: PluginHostListEntry['status']): boolean {
  return status === 'running' || status === 'restarting' || status === 'idle'
}

export function collectPluginTaskSources(
  plugins: readonly PluginHostListEntry[]
): PluginTaskSource[] {
  return plugins.flatMap((plugin) =>
    (plugin.taskSources ?? []).map((source) => ({
      ...source,
      pluginName: plugin.name,
      enabled: isEnabledStatus(plugin.status)
    }))
  )
}

/**
 * Ids Tasks may offer right now, or `undefined` while the registry has not
 * loaded. Undefined is not the same as empty: treating an unloaded registry as
 * "nothing available" would flash a plugin source out of the picker during
 * hydration and yank the user's selection to GitHub.
 */
export function collectAvailablePluginTaskSourceIds(
  plugins: readonly PluginHostListEntry[],
  loaded: boolean
): ReadonlySet<string> | undefined {
  if (!loaded) {
    return undefined
  }
  return new Set(
    collectPluginTaskSources(plugins)
      .filter((source) => source.enabled)
      .map((source) => source.providerId)
  )
}

export function usePluginTaskSources(): PluginTaskSource[] {
  ensurePluginPanelsLoaded()
  const plugins = usePluginPanelsStore((state) => state.plugins)
  return useMemo(() => collectPluginTaskSources(plugins), [plugins])
}

export function useAvailablePluginTaskSourceIds(): ReadonlySet<string> | undefined {
  ensurePluginPanelsLoaded()
  const plugins = usePluginPanelsStore((state) => state.plugins)
  const fetchStatus = usePluginPanelsStore((state) => state.fetchStatus)
  // 'error' counts as loaded: the registry answered as well as it ever will,
  // and holding sources visible forever would be worse than hiding them.
  const loaded = fetchStatus === 'ready' || fetchStatus === 'error'
  return useMemo(() => collectAvailablePluginTaskSourceIds(plugins, loaded), [plugins, loaded])
}

export function findPluginTaskSource(
  sources: readonly PluginTaskSource[],
  providerId: string
): PluginTaskSource | null {
  return sources.find((source) => source.providerId === providerId) ?? null
}
