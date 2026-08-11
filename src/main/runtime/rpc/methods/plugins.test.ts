import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RpcContext, RpcMethod } from '../core'
import type { PluginService } from '../../../plugins/plugin-service'
import { PLUGIN_METHODS, setPluginServiceForRpc } from './plugins'
import {
  PLUGIN_TASK_SOURCES_RUNTIME_CAPABILITY,
  RUNTIME_CAPABILITIES
} from '../../../../shared/protocol-version'

const SESSION_TOKEN = 's'.repeat(43)

function method(name: string): RpcMethod {
  const found = PLUGIN_METHODS.find((entry) => entry.name === name)
  if (!found) {
    throw new Error(`missing ${name}`)
  }
  if ('stream' in found) {
    throw new Error(`${name} is streaming`)
  }
  return found
}

function context(connectionId?: string): RpcContext {
  return { runtime: {} as RpcContext['runtime'], connectionId, clientId: 'paired-device' }
}

afterEach(() => setPluginServiceForRpc(null))

describe('plugin panel serve RPC identity', () => {
  it('leaves the raw panel envelope for session resolution and admission', () => {
    const schema = method('plugins.panelAction').params!

    expect(
      schema.safeParse({
        pluginId: 'orca-samples.other',
        unexpected: 'x'.repeat(100_000)
      }).success
    ).toBe(true)
  })

  it('binds panel loading and actions to the same runtime connection owner', async () => {
    const service = {
      whenReady: vi.fn().mockResolvedValue(undefined),
      panels: {
        open: vi.fn().mockResolvedValue({ html: '<p>panel</p>', sessionToken: SESSION_TOKEN }),
        execute: vi.fn().mockResolvedValue({ ok: true, value: { branch: 'main' } }),
        bindOwnerSignal: vi.fn(),
        revokeOwner: vi.fn()
      }
    } as unknown as PluginService
    setPluginServiceForRpc(service)
    const rpcContext = context('connection-one')

    await expect(
      method('plugins.readPanelEntry').handler(
        { pluginKey: 'orca-samples.demo', panelId: 'dashboard' },
        rpcContext
      )
    ).resolves.toEqual({ html: '<p>panel</p>', sessionToken: SESSION_TOKEN })
    expect(service.panels.open).toHaveBeenCalledWith(
      'runtime:connection-one',
      'orca-samples.demo',
      'dashboard'
    )

    await expect(
      method('plugins.panelAction').handler(
        { sessionToken: SESSION_TOKEN, action: 'workspace.readContext', params: {} },
        rpcContext
      )
    ).resolves.toEqual({ outcome: { ok: true, value: { branch: 'main' } } })
    expect(service.panels.execute).toHaveBeenCalledWith('runtime:connection-one', {
      sessionToken: SESSION_TOKEN,
      action: 'workspace.readContext',
      params: {}
    })
  })
})

describe('plugin task source serve RPC', () => {
  function taskSourceService(): PluginService {
    return {
      whenReady: vi.fn().mockResolvedValue(undefined),
      taskSources: {
        list: vi.fn().mockReturnValue([{ providerId: 'plugin:delorenj.plane/plane' }]),
        invoke: vi.fn().mockResolvedValue({ connections: [] })
      }
    } as unknown as PluginService
  }

  it('exposes contributed sources so a paired client can populate its selector', async () => {
    const service = taskSourceService()
    setPluginServiceForRpc(service)

    await expect(method('plugins.listTaskSources').handler(undefined, context())).resolves.toEqual({
      sources: [{ providerId: 'plugin:delorenj.plane/plane' }]
    })
  })

  it('routes an invocation through the service chokepoint', async () => {
    const service = taskSourceService()
    setPluginServiceForRpc(service)

    await expect(
      method('plugins.invokeTaskSource').handler(
        {
          pluginKey: 'delorenj.plane',
          sourceId: 'plane',
          method: 'connections.list',
          args: undefined
        },
        context()
      )
    ).resolves.toEqual({ connections: [] })
    expect(service.taskSources.invoke).toHaveBeenCalledWith(
      'delorenj.plane',
      'plane',
      'connections.list',
      undefined
    )
  })

  it('rejects a malformed invocation before it reaches the service', () => {
    const schema = method('plugins.invokeTaskSource').params!

    expect(schema.safeParse({ pluginKey: 'delorenj.plane', sourceId: 'plane' }).success).toBe(false)
  })

  it('advertises the capability clients gate the surface on', () => {
    expect(RUNTIME_CAPABILITIES).toContain(PLUGIN_TASK_SOURCES_RUNTIME_CAPABILITY)
  })
})
