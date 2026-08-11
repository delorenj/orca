import {
  getPluginTaskSourceMethodSpec,
  type PluginTaskSourceMethodSpec
} from '../../shared/plugins/plugin-task-source-methods'
import type { PluginTaskSourceContribution } from '../../shared/plugins/plugin-task-source-contribution'
import type { ValidDiscoveredPlugin } from './plugin-discovery'

/**
 * Admission and shape rules for one task-source call.
 *
 * The trust split matters here: consent lets a plugin's worker *run* arbitrary
 * Node, so nothing stops it returning junk. What it must never do is put
 * unvalidated shapes in front of the renderer, so params are checked on the
 * way in and results on the way out, and a mismatch is reported as a provider
 * error rather than propagated.
 */

export type PluginTaskSourceAdmission =
  | { ok: true; spec: PluginTaskSourceMethodSpec; source: PluginTaskSourceContribution }
  | { ok: false; error: string }

export function admitPluginTaskSourceCall(
  plugin: ValidDiscoveredPlugin,
  sourceId: string,
  method: string
): PluginTaskSourceAdmission {
  const source = plugin.manifest.contributes.taskSources.find((entry) => entry.id === sourceId)
  if (!source) {
    return { ok: false, error: `plugin ${plugin.pluginKey} contributes no task source ${sourceId}` }
  }
  if (!plugin.manifest.capabilities.some((capability) => capability.kind === 'tasks:provide')) {
    return { ok: false, error: `plugin ${plugin.pluginKey} lacks the tasks:provide capability` }
  }
  const spec = getPluginTaskSourceMethodSpec(method)
  if (!spec) {
    return { ok: false, error: `unknown task source method ${method}` }
  }
  // A method behind an undeclared feature is refused rather than attempted, so
  // the UI can hide the affordance and never offer an action that fails late.
  if (spec.feature && !source.features.includes(spec.feature)) {
    return {
      ok: false,
      error: `task source ${sourceId} does not declare the ${spec.feature} feature`
    }
  }
  return { ok: true, spec, source }
}

export type PluginTaskSourceParseResult<T> = { ok: true; value: T } | { ok: false; error: string }

export function parsePluginTaskSourceParams(
  spec: PluginTaskSourceMethodSpec,
  params: unknown
): PluginTaskSourceParseResult<unknown> {
  const parsed = spec.params.safeParse(params)
  if (parsed.success) {
    return { ok: true, value: parsed.data }
  }
  return { ok: false, error: `invalid ${spec.name} params: ${describeIssue(parsed.error)}` }
}

export function parsePluginTaskSourceResult(
  spec: PluginTaskSourceMethodSpec,
  value: unknown
): PluginTaskSourceParseResult<unknown> {
  const parsed = spec.result.safeParse(value)
  if (parsed.success) {
    return { ok: true, value: parsed.data }
  }
  return {
    ok: false,
    error: `plugin returned an invalid ${spec.name} result: ${describeIssue(parsed.error)}`
  }
}

function describeIssue(error: { issues: { path: PropertyKey[]; message: string }[] }): string {
  const issue = error.issues[0]
  const path = issue?.path.join('.') || '(root)'
  return `${path}: ${issue?.message ?? 'schema mismatch'}`
}
