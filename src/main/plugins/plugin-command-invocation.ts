import type { ValidDiscoveredPlugin } from './plugin-discovery'
import type { PluginWorkerHandle } from './plugin-host-process'

/** Command chokepoint for both transports, paired with the task-source
 *  controller so neither invocation path can skip its approval checks. */
export async function invokePluginWorkerCommand(options: {
  plugin: ValidDiscoveredPlugin | null
  commandId: string
  args: unknown
  ensureWorker: (plugin: ValidDiscoveredPlugin) => Promise<PluginWorkerHandle>
}): Promise<unknown> {
  const { plugin, commandId } = options
  if (!plugin) {
    throw new Error(`plugin for command ${commandId} is not enabled`)
  }
  assertPluginWorkerCommand(plugin, commandId)
  const handle = await options.ensureWorker(plugin)
  if (!handle.commands.includes(commandId)) {
    throw new Error(`plugin ${plugin.pluginKey} registered no handler for ${commandId}`)
  }
  return handle.invokeCommand(commandId, options.args)
}

export function assertPluginWorkerCommand(plugin: ValidDiscoveredPlugin, commandId: string): void {
  const command = plugin.manifest.contributes.commands.find((entry) => entry.id === commandId)
  if (!command) {
    throw new Error(`plugin ${plugin.pluginKey} does not contribute command ${commandId}`)
  }
  // Declarative aliases are renderer-owned and must never cross the worker
  // activation boundary, even if a compromised renderer invokes IPC directly.
  if (command.action !== undefined) {
    throw new Error(`plugin ${plugin.pluginKey} command ${commandId} is a built-in action alias`)
  }
}
