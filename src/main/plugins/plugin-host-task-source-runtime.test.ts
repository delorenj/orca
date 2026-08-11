import { describe, expect, it, vi } from 'vitest'
import { createPluginWorkerRuntime } from './plugin-host-runtime'
import type { PluginWorkerOrcaApi } from './plugin-host-runtime'

async function activateWith(
  activate: (orca: PluginWorkerOrcaApi) => void
): Promise<{
  send: ReturnType<typeof vi.fn>
  runtime: ReturnType<typeof createPluginWorkerRuntime>
}> {
  const send = vi.fn()
  const runtime = createPluginWorkerRuntime({
    send,
    importModule: async () => ({ default: activate })
  })
  await runtime.handleMessage({
    type: 'init',
    pluginId: 'delorenj.plane',
    pluginRoot: '/plugin',
    mainEntry: 'worker.js',
    grantedCapabilities: ['tasks:provide']
  })
  return { send, runtime }
}

const invoke = {
  type: 'invokeExtension' as const,
  callId: 7,
  point: 'taskSource' as const,
  providerId: 'plane',
  method: 'connections.list'
}

describe('worker task source registration', () => {
  it('reports registered task sources on ready', async () => {
    const { send } = await activateWith((orca) => {
      orca.taskSources.register('plane', { 'connections.list': () => ({ connections: [] }) })
    })

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ready', commands: [], taskSources: ['plane'] })
    )
  })

  it('routes an extension call to the registered implementation', async () => {
    const handler = vi.fn(() => ({ connections: [] }))
    const { send, runtime } = await activateWith((orca) => {
      orca.taskSources.register('plane', { 'connections.list': handler })
    })
    send.mockClear()

    await runtime.handleMessage({ ...invoke, args: { a: 1 } })

    expect(handler).toHaveBeenCalledWith({ a: 1 })
    expect(send).toHaveBeenCalledWith({
      type: 'extensionResult',
      callId: 7,
      ok: true,
      value: { connections: [] }
    })
  })

  it('reports a thrown implementation error instead of crashing the worker', async () => {
    const { send, runtime } = await activateWith((orca) => {
      orca.taskSources.register('plane', {
        'connections.list': () => {
          throw new Error('plane is unreachable')
        }
      })
    })
    send.mockClear()

    await runtime.handleMessage(invoke)

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'extensionResult', callId: 7, ok: false })
    )
    expect(send.mock.calls[0]![0].error).toContain('plane is unreachable')
  })

  it('answers a call for an unregistered source without hanging the host', async () => {
    const { send, runtime } = await activateWith(() => {})
    send.mockClear()

    await runtime.handleMessage(invoke)

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'extensionResult', callId: 7, ok: false })
    )
    expect(send.mock.calls[0]![0].error).toContain('no taskSource handler')
  })
})
