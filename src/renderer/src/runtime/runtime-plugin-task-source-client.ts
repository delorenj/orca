import type {
  PluginTaskComment,
  PluginTaskConnection,
  PluginTaskScope,
  PluginTaskState,
  PluginTaskWorkItem,
  PluginTaskWorkItemPage,
  PluginTaskWorkItemPatch,
  PluginTaskWorkItemRef,
  PluginTaskQuery
} from '../../../shared/plugins/plugin-task-source-contract'
import { parsePluginTaskSourceId } from '../../../shared/task-source-id'
import { getActiveRuntimeTarget } from './runtime-rpc-client'
import { callRuntimeRpc } from './runtime-rpc-client'
import type { GlobalSettings } from '../../../shared/types'

/**
 * Routes one task-source call to whichever host owns the plugin.
 *
 * Plugins run on the runtime, so a paired client must reach its providers over
 * RPC rather than querying the desktop's own plugin set — otherwise a remote
 * runtime would silently answer from the wrong machine's plugins.
 */

export type PluginTaskSourceRuntimeSettings =
  | Pick<GlobalSettings, 'activeRuntimeEnvironmentId'>
  | null
  | undefined

async function invoke<TResult>(
  settings: PluginTaskSourceRuntimeSettings,
  providerId: string,
  method: string,
  args?: unknown
): Promise<TResult> {
  const parsed = parsePluginTaskSourceId(providerId)
  if (!parsed) {
    throw new Error(`invalid plugin task source id: ${providerId}`)
  }
  const params = { pluginKey: parsed.pluginKey, sourceId: parsed.sourceId, method, args }
  const target = getActiveRuntimeTarget(settings)
  return target.kind === 'environment'
    ? callRuntimeRpc<TResult>(target, 'plugins.invokeTaskSource', params, { timeoutMs: 45_000 })
    : (window.api.plugins.invokeTaskSource(params) as Promise<TResult>)
}

export function pluginTaskConnections(
  settings: PluginTaskSourceRuntimeSettings,
  providerId: string
): Promise<{ connections: PluginTaskConnection[] }> {
  return invoke(settings, providerId, 'connections.list')
}

export function pluginTaskUpsertConnection(
  settings: PluginTaskSourceRuntimeSettings,
  providerId: string,
  input: { connectionId?: string; label: string; values: Record<string, string> }
): Promise<{ connection: PluginTaskConnection }> {
  return invoke(settings, providerId, 'connections.upsert', input)
}

export function pluginTaskDeleteConnection(
  settings: PluginTaskSourceRuntimeSettings,
  providerId: string,
  connectionId: string
): Promise<{ ok: true }> {
  return invoke(settings, providerId, 'connections.delete', { connectionId })
}

export function pluginTaskScopes(
  settings: PluginTaskSourceRuntimeSettings,
  providerId: string,
  connectionId: string
): Promise<{ scopes: PluginTaskScope[] }> {
  return invoke(settings, providerId, 'scopes.list', { connectionId })
}

export function pluginTaskWorkItems(
  settings: PluginTaskSourceRuntimeSettings,
  providerId: string,
  query: PluginTaskQuery
): Promise<PluginTaskWorkItemPage> {
  return invoke(settings, providerId, 'workItems.list', query)
}

export function pluginTaskWorkItem(
  settings: PluginTaskSourceRuntimeSettings,
  providerId: string,
  ref: PluginTaskWorkItemRef
): Promise<{ workItem: PluginTaskWorkItem | null }> {
  return invoke(settings, providerId, 'workItems.get', ref)
}

export function pluginTaskUpdateWorkItem(
  settings: PluginTaskSourceRuntimeSettings,
  providerId: string,
  ref: PluginTaskWorkItemRef,
  patch: PluginTaskWorkItemPatch
): Promise<{ workItem: PluginTaskWorkItem }> {
  return invoke(settings, providerId, 'workItems.update', { ref, patch })
}

export function pluginTaskStates(
  settings: PluginTaskSourceRuntimeSettings,
  providerId: string,
  scope: { connectionId: string; scopeId: string }
): Promise<{ states: PluginTaskState[] }> {
  return invoke(settings, providerId, 'states.list', scope)
}

export function pluginTaskComments(
  settings: PluginTaskSourceRuntimeSettings,
  providerId: string,
  ref: PluginTaskWorkItemRef
): Promise<{ comments: PluginTaskComment[]; nextCursor: string | null }> {
  return invoke(settings, providerId, 'comments.list', { ref })
}

export function pluginTaskCreateComment(
  settings: PluginTaskSourceRuntimeSettings,
  providerId: string,
  ref: PluginTaskWorkItemRef,
  bodyMarkdown: string
): Promise<{ comment: PluginTaskComment }> {
  return invoke(settings, providerId, 'comments.create', { ref, bodyMarkdown })
}
