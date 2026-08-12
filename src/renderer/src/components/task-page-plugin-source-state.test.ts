import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { PluginTaskWorkItem } from '../../../shared/plugins/plugin-task-source-contract'
import {
  groupPluginTaskWorkItems,
  pluginTaskWorkItemKey,
  sortPluginTaskWorkItems
} from './task-page-plugin-source-state'

function item(overrides: Partial<PluginTaskWorkItem> & { id: string }): PluginTaskWorkItem {
  return {
    connectionId: 'c1',
    scopeId: 's1',
    identifier: `PLANE-${overrides.id}`,
    title: `Item ${overrides.id}`,
    state: { id: 'st', name: 'Todo', group: 'unstarted' },
    assignees: [],
    labels: [],
    url: `https://plane.example/${overrides.id}`,
    ...overrides
  }
}

describe('plugin task work item grouping', () => {
  it('orders lifecycle groups by what you would work next', () => {
    const grouped = groupPluginTaskWorkItems([
      item({ id: '1', state: { id: 'a', name: 'Done', group: 'completed' } }),
      item({ id: '2', state: { id: 'b', name: 'Backlog', group: 'backlog' } }),
      item({ id: '3', state: { id: 'c', name: 'Doing', group: 'started' } })
    ])

    expect(grouped.map((section) => section.key)).toEqual(['started', 'backlog', 'completed'])
  })

  it('omits groups with no items rather than rendering empty headers', () => {
    const grouped = groupPluginTaskWorkItems([item({ id: '1' })])

    expect(grouped).toHaveLength(1)
    expect(grouped[0]?.key).toBe('unstarted')
  })

  it('sorts most recently updated first', () => {
    const sorted = sortPluginTaskWorkItems([
      item({ id: 'old', updatedAt: '2026-01-01T00:00:00Z' }),
      item({ id: 'new', updatedAt: '2026-08-01T00:00:00Z' })
    ])

    expect(sorted.map((entry) => entry.id)).toEqual(['new', 'old'])
  })

  it('keys items across connections without collision', () => {
    const a = pluginTaskWorkItemKey(item({ id: 'x', connectionId: 'c1' }))
    const b = pluginTaskWorkItemKey(item({ id: 'x', connectionId: 'c2' }))

    expect(a).not.toBe(b)
  })
})

/**
 * Regression guard for the trap that neither tsc nor oxlint can see: the
 * content ternary chain in TaskPage has no `taskSource` guard below its Linear
 * arms and its terminal branch renders the Linear list, so a plugin source
 * placed anywhere but first would silently render "Connect your Linear
 * account".
 */
describe('plugin source render placement', () => {
  const source = readFileSync(join(__dirname, 'TaskPage.tsx'), 'utf8')

  it('branches on a plugin source before any built-in arm', () => {
    const pluginArm = source.indexOf('isPluginTaskSourceId(taskSource) ? (')
    const firstBuiltinArm = source.indexOf("taskSource === 'github' && dialogWorkItem ? (")

    expect(pluginArm).toBeGreaterThan(-1)
    expect(firstBuiltinArm).toBeGreaterThan(-1)
    expect(pluginArm).toBeLessThan(firstBuiltinArm)
  })

  it('merges plugin options into the source picker before the visibility filter', () => {
    const merge = source.indexOf('...pluginTaskSources.map')
    const filter = source.indexOf('sourceOptions.filter((source) => visibleTaskProviders.includes')

    expect(merge).toBeGreaterThan(-1)
    expect(merge).toBeLessThan(filter)
  })
})
