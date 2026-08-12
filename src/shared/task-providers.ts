import { isPluginTaskSourceId, isTaskSourceId, type TaskSourceId } from './task-source-id'

/** Providers Orca implements in-tree. Stays narrow on purpose: every
 *  `Record<TaskProvider, …>` and exhaustive switch keys off it, and widening it
 *  would make those lookups compile while returning undefined. Plugin-backed
 *  sources use `TaskSourceId` instead. */
export type TaskProvider = 'github' | 'gitlab' | 'linear' | 'jira'

export const TASK_PROVIDERS: readonly TaskProvider[] = ['github', 'gitlab', 'linear', 'jira']

const TASK_PROVIDER_SET = new Set<TaskProvider>(TASK_PROVIDERS)

export function isTaskProvider(value: unknown): value is TaskProvider {
  return TASK_PROVIDER_SET.has(value as TaskProvider)
}

export function normalizeTaskProviderSettings(value: {
  visibleTaskProviders: unknown
  defaultTaskSource: unknown
}): { visibleTaskProviders: TaskSourceId[]; defaultTaskSource: TaskSourceId } {
  const visibleTaskProviders = normalizeVisibleTaskProviders(value.visibleTaskProviders)
  const defaultTaskSource = isTaskSourceId(value.defaultTaskSource)
    ? value.defaultTaskSource
    : resolveVisibleTaskProvider('github', visibleTaskProviders)

  if (visibleTaskProviders.includes(defaultTaskSource)) {
    return { visibleTaskProviders, defaultTaskSource }
  }

  // Why: older profiles can keep a saved default while the visible-provider
  // list drifted. Persist the default back into the list so every surface reads
  // the same settings contract.
  return {
    defaultTaskSource,
    visibleTaskProviders: withTaskSourceRestored(visibleTaskProviders, defaultTaskSource)
  }
}

/**
 * Rebuilds a visible list that is missing `restored`.
 *
 * Built-ins keep their canonical TASK_PROVIDERS order, but plugin sources are
 * carried over from the input verbatim: rebuilding the whole list from
 * TASK_PROVIDERS (as this once did) silently erased every plugin source the
 * user had selected.
 */
function withTaskSourceRestored(
  visibleProviders: readonly TaskSourceId[],
  restored: TaskSourceId
): TaskSourceId[] {
  const builtins = TASK_PROVIDERS.filter(
    (provider) => provider === restored || visibleProviders.includes(provider)
  )
  const pluginSources = visibleProviders.filter(isPluginTaskSourceId)
  if (isPluginTaskSourceId(restored) && !pluginSources.includes(restored)) {
    pluginSources.push(restored)
  }
  return [...builtins, ...pluginSources]
}

export function normalizeVisibleTaskProviders(value: unknown): TaskSourceId[] {
  if (!Array.isArray(value)) {
    return [...TASK_PROVIDERS]
  }

  const normalized: TaskSourceId[] = []
  for (const provider of value) {
    // Why: plugin source ids are open-ended, so validate the grammar rather
    // than membership. Settings hydrate before any plugin registry exists (and
    // headless serve may never build one), so a membership test here would
    // erase the user's plugin sources on every cold start.
    if (!isTaskSourceId(provider) || normalized.includes(provider)) {
      continue
    }
    normalized.push(provider)
  }

  // Why: at least one provider must remain visible so the Tasks surface always
  // has a valid source to select after settings hydration or manual edits.
  return normalized.length > 0 ? normalized : [...TASK_PROVIDERS]
}

export type TaskProviderAvailability = {
  gitlabInstalled: boolean
  linearConnected: boolean
  /** Plugin source ids contributed by a currently-enabled plugin. `undefined`
   *  means the plugin registry has not loaded yet — keep plugin sources visible
   *  rather than flashing them away mid-hydration and yanking the user's
   *  selection to GitHub. */
  availablePluginSources?: ReadonlySet<string>
}

export function filterAvailableTaskProviders(
  visibleProviders: readonly TaskSourceId[],
  availability: TaskProviderAvailability
): TaskSourceId[] {
  const available = visibleProviders.filter((provider) =>
    isTaskProviderAvailable(provider, availability)
  )

  return available.length > 0 ? available : ['github']
}

export function restoreAvailableDefaultTaskProvider(
  visibleProviders: readonly TaskSourceId[],
  availability: TaskProviderAvailability,
  preferredProvider: unknown
): TaskSourceId[] {
  const available = filterAvailableTaskProviders(visibleProviders, availability)

  // Why: older or drifted settings can hide the saved default while another
  // provider becomes available. Keep that default reachable after hydration.
  if (
    isTaskSourceId(preferredProvider) &&
    isTaskProviderAvailable(preferredProvider, availability) &&
    !available.includes(preferredProvider)
  ) {
    return withTaskSourceRestored(available, preferredProvider)
  }

  return available
}

function isTaskProviderAvailable(
  provider: TaskSourceId,
  availability: TaskProviderAvailability
): boolean {
  if (isPluginTaskSourceId(provider)) {
    // Why: an uninstalled or disabled plugin's source stays in settings but
    // must not be offered — the same contract a persisted panel tab follows.
    return availability.availablePluginSources?.has(provider) ?? true
  }
  if (provider === 'github') {
    return true
  }
  if (provider === 'gitlab') {
    return availability.gitlabInstalled
  }
  // Why: Jira can be connected from the Tasks surface itself, so hiding it
  // when disconnected would remove the entry point for first-time setup.
  if (provider === 'jira') {
    return true
  }
  return availability.linearConnected
}

export function resolveVisibleTaskProvider(
  preferred: TaskSourceId | null | undefined,
  visibleProviders: readonly TaskSourceId[]
): TaskSourceId {
  if (preferred && visibleProviders.includes(preferred)) {
    return preferred
  }
  return visibleProviders[0] ?? 'github'
}
