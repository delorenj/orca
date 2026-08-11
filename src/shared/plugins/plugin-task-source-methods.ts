import { z } from 'zod'
import {
  PLUGIN_TASK_COMMENT_LIMIT,
  PLUGIN_TASK_LABEL_LIMIT,
  PLUGIN_TASK_PEOPLE_LIMIT,
  pluginTaskCommentSchema,
  pluginTaskConnectionSchema,
  pluginTaskLabelSchema,
  pluginTaskMemberSchema,
  pluginTaskQuerySchema,
  pluginTaskScopeSchema,
  pluginTaskStateSchema,
  pluginTaskWorkItemDraftSchema,
  pluginTaskWorkItemPageSchema,
  pluginTaskWorkItemPatchSchema,
  pluginTaskWorkItemRefSchema,
  pluginTaskWorkItemSchema,
  PLUGIN_TASK_BODY_MAX_LENGTH
} from './plugin-task-source-contract'

/**
 * Task-source method table — the single source of truth for the worker SDK's
 * typing, the host-side response validator, and the conformance test, in the
 * same spirit as `PLUGIN_HOST_API_V0`.
 *
 * Direction is the mirror of the host API: there, plugins call Orca; here,
 * Orca calls the plugin. So `result` is what the HOST validates on the way
 * back, and a schema mismatch is the plugin's bug, surfaced as a provider
 * error rather than corrupt renderer state.
 */

/** Optional behaviors a source declares in its manifest. The host refuses a
 *  method whose feature was not declared, so the UI can hide affordances
 *  instead of offering actions that fail at call time. */
export const PLUGIN_TASK_SOURCE_FEATURES = [
  'search',
  'create',
  'update',
  'comments',
  'transitions',
  'labels',
  'assignees'
] as const
export type PluginTaskSourceFeature = (typeof PLUGIN_TASK_SOURCE_FEATURES)[number]

const connectionScopedParams = z.object({ connectionId: z.string().min(1).max(256) }).strict()
const scopedParams = z
  .object({
    connectionId: z.string().min(1).max(256),
    scopeId: z.string().min(1).max(256)
  })
  .strict()

const commentsListParams = z
  .object({
    ref: pluginTaskWorkItemRefSchema,
    cursor: z.string().max(2048).optional(),
    limit: z.number().int().min(1).max(PLUGIN_TASK_COMMENT_LIMIT).default(50)
  })
  .strict()

const commentsCreateParams = z
  .object({
    ref: pluginTaskWorkItemRefSchema,
    bodyMarkdown: z.string().min(1).max(PLUGIN_TASK_BODY_MAX_LENGTH)
  })
  .strict()

export type PluginTaskSourceMethodSpec = {
  name: string
  /** pluginApi minor the method appeared in (`1.1` for the initial set). */
  since: string
  /** Declared feature that must be present, or null when always available. */
  feature: PluginTaskSourceFeature | null
  stability: 'experimental'
  /** Mutations are audit-logged with actor `plugin:<id>`. */
  mutation: boolean
  params: z.ZodTypeAny
  result: z.ZodTypeAny
}

const spec = <P extends z.ZodTypeAny, R extends z.ZodTypeAny>(
  entry: Omit<PluginTaskSourceMethodSpec, 'stability'> & { params: P; result: R }
): PluginTaskSourceMethodSpec => ({ ...entry, stability: 'experimental' })

export const PLUGIN_TASK_SOURCE_METHODS: readonly PluginTaskSourceMethodSpec[] = [
  spec({
    name: 'connections.list',
    since: '1.1',
    feature: null,
    mutation: false,
    params: z.object({}).strict().optional(),
    result: z.object({ connections: z.array(pluginTaskConnectionSchema).max(64) }).strict()
  }),
  spec({
    // Why: the host renders the connect form from `connectionFields` but does
    // not persist its values — it hands them here so the plugin can split
    // non-secret fields into its settings and credentials into its own vault.
    // Values are never echoed back to the renderer.
    name: 'connections.upsert',
    since: '1.1',
    feature: null,
    mutation: true,
    params: z
      .object({
        /** Absent when adding; present when editing an existing connection. */
        connectionId: z.string().min(1).max(256).optional(),
        label: z.string().min(1).max(1024),
        values: z.record(z.string().min(1).max(256), z.string().max(64 * 1024))
      })
      .strict(),
    result: z.object({ connection: pluginTaskConnectionSchema }).strict()
  }),
  spec({
    name: 'connections.delete',
    since: '1.1',
    feature: null,
    mutation: true,
    params: connectionScopedParams,
    result: z.object({ ok: z.literal(true) }).strict()
  }),
  spec({
    name: 'scopes.list',
    since: '1.1',
    feature: null,
    mutation: false,
    params: connectionScopedParams,
    result: z.object({ scopes: z.array(pluginTaskScopeSchema).max(1024) }).strict()
  }),
  spec({
    name: 'workItems.list',
    since: '1.1',
    feature: null,
    mutation: false,
    params: pluginTaskQuerySchema,
    result: pluginTaskWorkItemPageSchema
  }),
  spec({
    name: 'workItems.get',
    since: '1.1',
    feature: null,
    mutation: false,
    params: pluginTaskWorkItemRefSchema,
    result: z.object({ workItem: pluginTaskWorkItemSchema.nullable() }).strict()
  }),
  spec({
    name: 'workItems.create',
    since: '1.1',
    feature: 'create',
    mutation: true,
    params: pluginTaskWorkItemDraftSchema,
    result: z.object({ workItem: pluginTaskWorkItemSchema }).strict()
  }),
  spec({
    name: 'workItems.update',
    since: '1.1',
    feature: 'update',
    mutation: true,
    params: z
      .object({ ref: pluginTaskWorkItemRefSchema, patch: pluginTaskWorkItemPatchSchema })
      .strict(),
    result: z.object({ workItem: pluginTaskWorkItemSchema }).strict()
  }),
  spec({
    name: 'states.list',
    since: '1.1',
    feature: 'transitions',
    mutation: false,
    params: scopedParams,
    result: z.object({ states: z.array(pluginTaskStateSchema).max(256) }).strict()
  }),
  spec({
    name: 'labels.list',
    since: '1.1',
    feature: 'labels',
    mutation: false,
    params: scopedParams,
    result: z
      .object({ labels: z.array(pluginTaskLabelSchema).max(PLUGIN_TASK_LABEL_LIMIT * 16) })
      .strict()
  }),
  spec({
    name: 'members.list',
    since: '1.1',
    feature: 'assignees',
    mutation: false,
    params: scopedParams,
    result: z
      .object({ members: z.array(pluginTaskMemberSchema).max(PLUGIN_TASK_PEOPLE_LIMIT * 16) })
      .strict()
  }),
  spec({
    name: 'comments.list',
    since: '1.1',
    feature: 'comments',
    mutation: false,
    params: commentsListParams,
    result: z
      .object({
        comments: z.array(pluginTaskCommentSchema).max(PLUGIN_TASK_COMMENT_LIMIT),
        nextCursor: z.string().max(2048).nullable().default(null)
      })
      .strict()
  }),
  spec({
    name: 'comments.create',
    since: '1.1',
    feature: 'comments',
    mutation: true,
    params: commentsCreateParams,
    result: z.object({ comment: pluginTaskCommentSchema }).strict()
  })
]

const SPEC_BY_NAME = new Map(PLUGIN_TASK_SOURCE_METHODS.map((entry) => [entry.name, entry]))

export function getPluginTaskSourceMethodSpec(name: string): PluginTaskSourceMethodSpec | null {
  return SPEC_BY_NAME.get(name) ?? null
}

export const PLUGIN_TASK_SOURCE_METHOD_NAMES = PLUGIN_TASK_SOURCE_METHODS.map((entry) => entry.name)
