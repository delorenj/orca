import { describe, expect, it } from 'vitest'
import {
  asBuiltinTaskProvider,
  isPluginTaskSourceId,
  isTaskSourceId,
  parsePluginTaskSourceId
} from './task-source-id'
import {
  normalizeTaskProviderSettings,
  normalizeVisibleTaskProviders,
  restoreAvailableDefaultTaskProvider
} from './task-providers'

const PLANE = 'plugin:delorenj.plane/plane'

describe('plugin task source ids', () => {
  it('accepts a well-formed contribution key', () => {
    expect(isPluginTaskSourceId(PLANE)).toBe(true)
    expect(parsePluginTaskSourceId(PLANE)).toEqual({
      pluginKey: 'delorenj.plane',
      sourceId: 'plane'
    })
  })

  it.each([
    ['plugin:delorenj.plane/', 'empty source id'],
    ['plugin:delorenj.plane', 'missing source id'],
    ['plugin:plane/plane', 'unqualified plugin key'],
    ['plugin:delorenj.plane/plane/extra', 'extra segment'],
    ['plugin:delorenj.plane/__proto__', 'reserved source id'],
    ['plugin:delorenj.plane/Plane', 'non-kebab source id'],
    ['github', 'a built-in provider'],
    ['', 'the empty string']
  ])('rejects %s (%s)', (value) => {
    expect(isPluginTaskSourceId(value)).toBe(false)
  })

  // An empty trailing segment would let two sources of one plugin collide in
  // getTaskSourceCacheScope.
  it('never treats a panel-shaped key with an empty tail as a source', () => {
    expect(isPluginTaskSourceId('plugin:delorenj.plane//')).toBe(false)
  })

  it('narrows built-ins and refuses plugin ids', () => {
    expect(asBuiltinTaskProvider('jira')).toBe('jira')
    expect(asBuiltinTaskProvider(PLANE)).toBeNull()
  })

  it('admits both kinds as task source ids', () => {
    expect(isTaskSourceId('linear')).toBe(true)
    expect(isTaskSourceId(PLANE)).toBe(true)
    expect(isTaskSourceId('nope')).toBe(false)
  })
})

/**
 * Regression guard for the silent-drop class: settings hydrate before any
 * plugin registry exists, so anything that rebuilds the visible list from
 * TASK_PROVIDERS erases the user's plugin sources on a cold start.
 */
describe('plugin sources survive settings normalization', () => {
  it('keeps a plugin id in the visible list', () => {
    expect(normalizeVisibleTaskProviders(['github', PLANE])).toEqual(['github', PLANE])
  })

  it('keeps a plugin id that is also the default', () => {
    expect(
      normalizeTaskProviderSettings({ visibleTaskProviders: [PLANE], defaultTaskSource: PLANE })
    ).toEqual({ visibleTaskProviders: [PLANE], defaultTaskSource: PLANE })
  })

  it('re-adds a plugin default that drifted out of the visible list', () => {
    const result = normalizeTaskProviderSettings({
      visibleTaskProviders: ['github'],
      defaultTaskSource: PLANE
    })

    expect(result.defaultTaskSource).toBe(PLANE)
    expect(result.visibleTaskProviders).toContain(PLANE)
    expect(result.visibleTaskProviders).toContain('github')
  })

  it('drops ids that are neither a provider nor a valid contribution key', () => {
    expect(normalizeVisibleTaskProviders(['github', 'bitbucket', 'plugin:bad'])).toEqual(['github'])
  })

  it('preserves a plugin default through availability restoration', () => {
    const restored = restoreAvailableDefaultTaskProvider(
      ['github'],
      { gitlabInstalled: false, linearConnected: false, availablePluginSources: new Set([PLANE]) },
      PLANE
    )

    expect(restored).toContain(PLANE)
    expect(restored).toContain('github')
  })
})

describe('plugin source availability', () => {
  const availability = (sources?: ReadonlySet<string>) => ({
    gitlabInstalled: false,
    linearConnected: false,
    ...(sources ? { availablePluginSources: sources } : {})
  })

  it('hides a source whose plugin is uninstalled or disabled', () => {
    expect(
      restoreAvailableDefaultTaskProvider([PLANE, 'github'], availability(new Set()), 'github')
    ).not.toContain(PLANE)
  })

  it('shows a source whose plugin is enabled', () => {
    expect(
      restoreAvailableDefaultTaskProvider(
        [PLANE, 'github'],
        availability(new Set([PLANE])),
        'github'
      )
    ).toContain(PLANE)
  })

  // Undefined means "registry not loaded"; treating it as empty would flash the
  // source away mid-hydration and yank the selection to GitHub.
  it('keeps plugin sources visible while the registry is still loading', () => {
    expect(
      restoreAvailableDefaultTaskProvider([PLANE, 'github'], availability(), 'github')
    ).toContain(PLANE)
  })
})
