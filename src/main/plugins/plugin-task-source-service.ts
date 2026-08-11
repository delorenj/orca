import { pluginTaskProviderKey } from '../../shared/plugins/plugin-task-source-contribution'
import {
  projectPluginTaskSource,
  type PluginTaskSourceProjection
} from '../../shared/plugins/plugin-task-source-projection'
import type { PluginAuditLog } from './plugin-audit-log'
import {
  isInvalidDiscoveredPlugin,
  type DiscoveredPlugin,
  type ValidDiscoveredPlugin
} from './plugin-discovery'
import type { PluginWorkerHandle } from './plugin-host-process'
import {
  admitPluginTaskSourceCall,
  parsePluginTaskSourceParams,
  parsePluginTaskSourceResult
} from './plugin-task-source-invocation'

/**
 * Task-source chokepoint shared by desktop IPC and runtime RPC. Admission,
 * param checking, worker dispatch, result checking, and audit live behind one
 * object so no transport can reach a plugin provider on an easier path.
 */

export type PluginTaskSourceControllerOptions = {
  plugins: () => readonly DiscoveredPlugin[]
  /** Null for anything not currently installed, consented, and enabled. */
  resolveApprovedPlugin: (pluginKey: string) => ValidDiscoveredPlugin | null
  ensureWorker: (plugin: ValidDiscoveredPlugin) => Promise<PluginWorkerHandle>
  audit: PluginAuditLog
}

export class PluginTaskSourceController {
  constructor(private readonly options: PluginTaskSourceControllerOptions) {}

  /** Sources contributed by approved plugins, for the client projection that
   *  populates the Tasks source selector. */
  list(): PluginTaskSourceProjection[] {
    const sources: PluginTaskSourceProjection[] = []
    for (const plugin of this.options.plugins()) {
      // Identity comparison, not just a key lookup: a stale entry must not
      // present sources for a tree that was replaced by a newer install.
      if (
        isInvalidDiscoveredPlugin(plugin) ||
        this.options.resolveApprovedPlugin(plugin.pluginKey) !== plugin
      ) {
        continue
      }
      for (const source of plugin.manifest.contributes.taskSources) {
        sources.push(
          projectPluginTaskSource(
            pluginTaskProviderKey(plugin.pluginKey, source.id),
            plugin.pluginKey,
            source
          )
        )
      }
    }
    return sources
  }

  async invoke(
    pluginKey: string,
    sourceId: string,
    method: string,
    args?: unknown
  ): Promise<unknown> {
    const plugin = this.options.resolveApprovedPlugin(pluginKey)
    if (!plugin) {
      throw new Error(`plugin ${pluginKey} is not enabled`)
    }
    const admission = admitPluginTaskSourceCall(plugin, sourceId, method)
    if (!admission.ok) {
      throw new Error(admission.error)
    }
    const params = parsePluginTaskSourceParams(admission.spec, args)
    if (!params.ok) {
      throw new Error(params.error)
    }
    const handle = await this.options.ensureWorker(plugin)
    if (!handle.taskSources.includes(sourceId)) {
      throw new Error(`plugin ${pluginKey} registered no implementation for ${sourceId}`)
    }
    // Summary stays bounded to the addressed source: params carry issue bodies
    // and comment text, which must never land in the audit log.
    const record = (outcome: 'attempt' | 'ok' | 'error'): void => {
      if (admission.spec.mutation) {
        void this.options.audit.record({
          ts: Date.now(),
          actor: `plugin:${pluginKey}`,
          method: `taskSource.${method}`,
          summary: sourceId,
          outcome
        })
      }
    }
    record('attempt')
    try {
      const raw = await handle.invokeExtension('taskSource', sourceId, method, params.value)
      const result = parsePluginTaskSourceResult(admission.spec, raw)
      if (!result.ok) {
        throw new Error(result.error)
      }
      record('ok')
      return result.value
    } catch (error) {
      record('error')
      throw error
    }
  }
}
