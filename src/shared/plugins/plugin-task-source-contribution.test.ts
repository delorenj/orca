import { describe, expect, it } from 'vitest'
import { parsePluginManifest } from './plugin-manifest'
import { pluginTaskProviderKey } from './plugin-task-source-contribution'

const base = {
  manifestVersion: 1,
  id: 'plane',
  publisher: 'delorenj',
  name: 'Plane',
  version: '0.1.0',
  engines: { orca: '>=1.4.0' },
  pluginApi: 1,
  main: 'dist/main.mjs'
}

const source = {
  id: 'plane',
  title: 'Plane',
  features: ['comments'],
  connectionFields: [
    { key: 'base-url', label: 'API base URL', kind: 'url' },
    { key: 'api-key', label: 'API key', kind: 'password' }
  ]
}

function manifest(overrides: Record<string, unknown> = {}): unknown {
  return {
    ...base,
    contributes: { taskSources: [source] },
    capabilities: [{ kind: 'tasks:provide' }, { kind: 'secrets' }],
    ...overrides
  }
}

describe('taskSources contribution', () => {
  it('accepts a well-formed task source', () => {
    const parsed = parsePluginManifest(manifest())

    expect(parsed.ok).toBe(true)
  })

  it('requires the tasks:provide capability', () => {
    const parsed = parsePluginManifest(manifest({ capabilities: [{ kind: 'secrets' }] }))

    expect(parsed).toMatchObject({ ok: false })
    expect(parsed.ok ? '' : parsed.error).toContain('tasks:provide capability required')
  })

  it('requires the secrets capability for a password field', () => {
    const parsed = parsePluginManifest(manifest({ capabilities: [{ kind: 'tasks:provide' }] }))

    expect(parsed).toMatchObject({ ok: false })
    expect(parsed.ok ? '' : parsed.error).toContain('secrets capability required')
  })

  it('requires a worker entry because a task source is answered by code', () => {
    const { main: _main, ...withoutMain } = base
    const parsed = parsePluginManifest({
      ...withoutMain,
      contributes: { taskSources: [source] },
      capabilities: [{ kind: 'tasks:provide' }, { kind: 'secrets' }]
    })

    expect(parsed).toMatchObject({ ok: false })
    expect(parsed.ok ? '' : parsed.error).toContain('main')
  })

  it('rejects duplicate source ids', () => {
    const parsed = parsePluginManifest(manifest({ contributes: { taskSources: [source, source] } }))

    expect(parsed).toMatchObject({ ok: false })
    expect(parsed.ok ? '' : parsed.error).toContain('duplicate taskSources id')
  })

  it('rejects duplicate connection field keys', () => {
    const fields = [source.connectionFields[0], source.connectionFields[0]]
    const parsed = parsePluginManifest(
      manifest({ contributes: { taskSources: [{ ...source, connectionFields: fields }] } })
    )

    expect(parsed).toMatchObject({ ok: false })
    expect(parsed.ok ? '' : parsed.error).toContain('duplicate connection field key')
  })

  it('requires at least one connection field', () => {
    const parsed = parsePluginManifest(
      manifest({ contributes: { taskSources: [{ ...source, connectionFields: [] }] } })
    )

    expect(parsed).toMatchObject({ ok: false })
  })

  it('builds a provider key that round-trips the plugin and source identity', () => {
    expect(pluginTaskProviderKey('delorenj.plane', 'plane')).toBe('plugin:delorenj.plane/plane')
  })
})
