import type {
  PluginTaskStateGroup,
  PluginTaskWorkItem
} from '../../../shared/plugins/plugin-task-source-contract'

/**
 * Pure grouping and tone rules for a plugin task source list. Kept free of
 * React so the ordering contract is unit-testable without rendering.
 */

/** Board order: what you would work next comes first, done work last. */
const GROUP_ORDER: readonly PluginTaskStateGroup[] = [
  'started',
  'unstarted',
  'backlog',
  'completed',
  'cancelled'
]

const GROUP_RANK = new Map(GROUP_ORDER.map((group, index) => [group, index]))

export type PluginTaskWorkItemSection = {
  key: PluginTaskStateGroup
  items: PluginTaskWorkItem[]
}

/** Tailwind tone per lifecycle group, matching the built-in status chips. */
export function pluginTaskStateTone(group: PluginTaskStateGroup): string {
  switch (group) {
    case 'started':
      return 'text-blue-500'
    case 'completed':
      return 'text-emerald-500'
    case 'cancelled':
      return 'text-muted-foreground'
    case 'unstarted':
      return 'text-amber-500'
    case 'backlog':
      return 'text-muted-foreground'
  }
}

/**
 * Groups by lifecycle rather than by the provider's own state names, so two
 * connections with different workflow vocabularies still read the same.
 */
export function groupPluginTaskWorkItems(
  items: readonly PluginTaskWorkItem[]
): PluginTaskWorkItemSection[] {
  const byGroup = new Map<PluginTaskStateGroup, PluginTaskWorkItem[]>()
  for (const item of items) {
    const bucket = byGroup.get(item.state.group)
    if (bucket) {
      bucket.push(item)
    } else {
      byGroup.set(item.state.group, [item])
    }
  }
  return [...byGroup.entries()]
    .map(([key, groupItems]) => ({ key, items: groupItems }))
    .sort(
      (a, b) =>
        (GROUP_RANK.get(a.key) ?? GROUP_ORDER.length) -
        (GROUP_RANK.get(b.key) ?? GROUP_ORDER.length)
    )
}

/** Most recently touched first; providers are not required to sort. */
export function sortPluginTaskWorkItems(
  items: readonly PluginTaskWorkItem[]
): PluginTaskWorkItem[] {
  return [...items].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
}

/** A stable identity for cache keys and list keys across connections. */
export function pluginTaskWorkItemKey(item: PluginTaskWorkItem): string {
  return `${item.connectionId}/${item.scopeId}/${item.id}`
}
