import { parsePluginContributionKey } from './plugins/plugin-manifest'
import { isTaskProvider, type TaskProvider } from './task-providers'

/**
 * The id of anything the user can select as a Tasks source: a built-in
 * provider or a plugin-contributed one.
 *
 * Deliberately a SEPARATE type from `TaskProvider` rather than a widening of
 * it. Widening `TaskProvider` to include a template-literal member compiles
 * with zero diagnostics — an object literal still satisfies
 * `Record<TaskProvider, X>` through its implicit index signature, so every
 * provider-keyed lookup would typecheck and then return `undefined` at
 * runtime. Keeping `TaskProvider` narrow means those maps and the exhaustive
 * switches over them stay compiler-enforced, and every place that must now
 * cope with a plugin id becomes a real type error instead.
 */
export type PluginTaskSourceId = `plugin:${string}`

export type TaskSourceId = TaskProvider | PluginTaskSourceId

export function isPluginTaskSourceId(value: unknown): value is PluginTaskSourceId {
  return typeof value === 'string' && parsePluginContributionKey(value) !== null
}

export function isTaskSourceId(value: unknown): value is TaskSourceId {
  return isTaskProvider(value) || isPluginTaskSourceId(value)
}

/** Narrows a selected id back to a built-in provider, or null for a plugin
 *  source — the gate callers use before touching a `Record<TaskProvider, …>`. */
export function asBuiltinTaskProvider(id: TaskSourceId): TaskProvider | null {
  return isTaskProvider(id) ? id : null
}

export function parsePluginTaskSourceId(
  id: string
): { pluginKey: string; sourceId: string } | null {
  const parsed = parsePluginContributionKey(id)
  return parsed ? { pluginKey: parsed.qualifiedKey, sourceId: parsed.contributionId } : null
}
