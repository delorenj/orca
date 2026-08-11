import { describe, expect, it } from 'vitest'
import { pluginManifestSchema } from '../../shared/plugins/plugin-manifest'
import { getPluginTaskSourceMethodSpec } from '../../shared/plugins/plugin-task-source-methods'
import type { ValidDiscoveredPlugin } from './plugin-discovery'
import {
  admitPluginTaskSourceCall,
  parsePluginTaskSourceParams,
  parsePluginTaskSourceResult
} from './plugin-task-source-invocation'

function plugin(overrides: { features?: string[] } = {}): ValidDiscoveredPlugin {
  return {
    pluginKey: 'delorenj.plane',
    rootDir: '/plugins/delorenj.plane',
    manifest: pluginManifestSchema.parse({
      manifestVersion: 1,
      id: 'plane',
      publisher: 'delorenj',
      name: 'Plane',
      version: '0.1.0',
      engines: { orca: '>=1.4.0' },
      pluginApi: 1,
      main: 'dist/main.mjs',
      contributes: {
        taskSources: [
          {
            id: 'plane',
            title: 'Plane',
            features: overrides.features ?? ['comments', 'update'],
            connectionFields: [{ key: 'api-key', label: 'API key', kind: 'password' }]
          }
        ]
      },
      capabilities: [{ kind: 'tasks:provide' }, { kind: 'secrets' }]
    }),
    consentFingerprint: 'sha256-current',
    contentHash: null,
    isDev: true
  }
}

const listRef = {
  connectionId: 'c1',
  scopeId: 's1',
  workItemId: 'w1'
}

describe('task source admission', () => {
  it('admits a declared source and method', () => {
    expect(admitPluginTaskSourceCall(plugin(), 'plane', 'workItems.get')).toMatchObject({
      ok: true
    })
  })

  it('refuses a source the manifest does not contribute', () => {
    const admission = admitPluginTaskSourceCall(plugin(), 'jira', 'workItems.get')

    expect(admission).toMatchObject({ ok: false })
    expect(admission.ok ? '' : admission.error).toContain('contributes no task source')
  })

  // Manifest validation already rejects this combination, so the manifest is
  // built by hand: the point is that the invocation chokepoint re-gates rather
  // than trusting that every manifest reaching it was schema-checked.
  it('refuses when the tasks:provide capability is absent', () => {
    const withoutCapability = plugin()
    const manifest = {
      ...withoutCapability.manifest,
      capabilities: [{ kind: 'secrets' as const }]
    }
    const admission = admitPluginTaskSourceCall(
      { ...withoutCapability, manifest },
      'plane',
      'workItems.get'
    )

    expect(admission).toMatchObject({ ok: false })
    expect(admission.ok ? '' : admission.error).toContain('tasks:provide')
  })

  it('refuses an unknown method rather than forwarding it to the worker', () => {
    const admission = admitPluginTaskSourceCall(plugin(), 'plane', 'workItems.destroyEverything')

    expect(admission).toMatchObject({ ok: false })
    expect(admission.ok ? '' : admission.error).toContain('unknown task source method')
  })

  it('refuses a method whose feature the source did not declare', () => {
    const admission = admitPluginTaskSourceCall(
      plugin({ features: ['comments'] }),
      'plane',
      'workItems.create'
    )

    expect(admission).toMatchObject({ ok: false })
    expect(admission.ok ? '' : admission.error).toContain('create feature')
  })
})

describe('task source payload validation', () => {
  it('rejects params that do not match the method schema', () => {
    const spec = getPluginTaskSourceMethodSpec('workItems.get')!

    expect(parsePluginTaskSourceParams(spec, { connectionId: 'c1' })).toMatchObject({ ok: false })
  })

  it('accepts well-formed params', () => {
    const spec = getPluginTaskSourceMethodSpec('workItems.get')!

    expect(parsePluginTaskSourceParams(spec, listRef)).toMatchObject({ ok: true })
  })

  it('rejects a plugin result that does not match the contract', () => {
    const spec = getPluginTaskSourceMethodSpec('workItems.get')!
    const result = parsePluginTaskSourceResult(spec, { workItem: { id: 'w1' } })

    expect(result).toMatchObject({ ok: false })
    expect(result.ok ? '' : result.error).toContain('invalid workItems.get result')
  })

  it('rejects a work item carrying a non-http url', () => {
    const spec = getPluginTaskSourceMethodSpec('workItems.get')!
    const result = parsePluginTaskSourceResult(spec, {
      workItem: {
        id: 'w1',
        connectionId: 'c1',
        scopeId: 's1',
        identifier: 'PLANE-1',
        title: 'Ship it',
        state: { id: 'st', name: 'Todo', group: 'unstarted' },
        url: 'javascript:alert(1)'
      }
    })

    expect(result).toMatchObject({ ok: false })
  })

  it('accepts a minimal well-formed work item and fills array defaults', () => {
    const spec = getPluginTaskSourceMethodSpec('workItems.get')!
    const result = parsePluginTaskSourceResult(spec, {
      workItem: {
        id: 'w1',
        connectionId: 'c1',
        scopeId: 's1',
        identifier: 'PLANE-1',
        title: 'Ship it',
        state: { id: 'st', name: 'Todo', group: 'unstarted' },
        url: 'https://plane.example/issue/w1'
      }
    })

    expect(result).toMatchObject({
      ok: true,
      value: { workItem: { assignees: [], labels: [] } }
    })
  })

  it('rejects an unknown state group', () => {
    const spec = getPluginTaskSourceMethodSpec('workItems.get')!
    const result = parsePluginTaskSourceResult(spec, {
      workItem: {
        id: 'w1',
        connectionId: 'c1',
        scopeId: 's1',
        identifier: 'PLANE-1',
        title: 'Ship it',
        state: { id: 'st', name: 'Todo', group: 'in-review' },
        url: 'https://plane.example/issue/w1'
      }
    })

    expect(result).toMatchObject({ ok: false })
  })
})
