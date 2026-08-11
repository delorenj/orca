import { z } from 'zod'

/**
 * Normalized task-source data contract. A plugin answers a fixed set of
 * questions in these shapes; Orca renders them with the same native surfaces
 * that serve the built-in providers, so a plugin never draws UI and never
 * learns Orca's internals.
 *
 * The host re-validates every plugin response against these schemas. A worker
 * is trusted to *run* (consent covers `main` as trusted Node) but is never
 * trusted to return well-formed data to the renderer.
 *
 * Rich text is Markdown only. Accepting provider HTML here would push
 * plugin-controlled markup into the renderer; plugins convert on their side.
 *
 * Electron-free: desktop main, headless serve, the relay, and tests all import
 * it. EXPERIMENTAL — additive-only within pluginApi major 1 once frozen.
 */

export const PLUGIN_TASK_TEXT_MAX_LENGTH = 1024
export const PLUGIN_TASK_BODY_MAX_LENGTH = 256 * 1024
export const PLUGIN_TASK_PEOPLE_LIMIT = 64
export const PLUGIN_TASK_LABEL_LIMIT = 64
export const PLUGIN_TASK_PAGE_LIMIT = 200
export const PLUGIN_TASK_COMMENT_LIMIT = 200

/** Opaque provider-side identifier (Plane uses UUIDs, others use keys). */
const entityIdSchema = z.string().min(1).max(256)
const shortTextSchema = z.string().min(1).max(PLUGIN_TASK_TEXT_MAX_LENGTH)
const isoTimestampSchema = z.string().min(1).max(64)
/** Absolute http(s) link; the renderer opens it externally. */
const externalUrlSchema = z
  .string()
  .max(2048)
  .refine((value) => /^https?:\/\//.test(value), 'must be an absolute http(s) URL')
const colorSchema = z
  .string()
  .max(32)
  .regex(/^#[0-9a-fA-F]{3,8}$/, 'must be a hex color')

/**
 * Lifecycle buckets every supported tracker can express. Named after Plane's
 * own state groups because they are the widest common vocabulary — Jira
 * categories and Linear state types both collapse into them without loss.
 */
export const PLUGIN_TASK_STATE_GROUPS = [
  'backlog',
  'unstarted',
  'started',
  'completed',
  'cancelled'
] as const
export type PluginTaskStateGroup = (typeof PLUGIN_TASK_STATE_GROUPS)[number]

export const PLUGIN_TASK_PRIORITIES = ['urgent', 'high', 'medium', 'low', 'none'] as const
export type PluginTaskPriority = (typeof PLUGIN_TASK_PRIORITIES)[number]

export const pluginTaskStateSchema = z
  .object({
    id: entityIdSchema,
    name: shortTextSchema,
    group: z.enum(PLUGIN_TASK_STATE_GROUPS),
    color: colorSchema.optional()
  })
  .strict()

export const pluginTaskLabelSchema = z
  .object({ id: entityIdSchema, name: shortTextSchema, color: colorSchema.optional() })
  .strict()

export const pluginTaskMemberSchema = z
  .object({
    id: entityIdSchema,
    name: shortTextSchema,
    email: z.string().max(320).optional(),
    avatarUrl: externalUrlSchema.optional()
  })
  .strict()

/**
 * One configured tracker instance. Multi-instance is the default shape, not an
 * add-on: a self-hosted Plane and Plane Cloud are two connections of one
 * source, each with its own credential.
 */
export const pluginTaskConnectionSchema = z
  .object({
    id: entityIdSchema,
    label: shortTextSchema,
    /** Shown for disambiguation only; never a fetch target for the host. */
    baseUrl: z.string().max(2048).optional(),
    connected: z.boolean(),
    /** Present when the last probe failed, so the UI can offer a reconnect. */
    error: z.string().max(2048).optional()
  })
  .strict()

/**
 * A project/board within a connection. Scope selection is mandatory in the UI
 * for the same reason GitHub requires a repo: cross-project listing is not
 * universally available (self-hosted Plane exposes no workspace-wide list).
 */
export const pluginTaskScopeSchema = z
  .object({
    id: entityIdSchema,
    connectionId: entityIdSchema,
    /** Short human key used to build work-item identifiers (`33GOD`). */
    key: z.string().min(1).max(64),
    name: shortTextSchema
  })
  .strict()

export const pluginTaskWorkItemSchema = z
  .object({
    id: entityIdSchema,
    connectionId: entityIdSchema,
    scopeId: entityIdSchema,
    /** Human key such as `33GOD-42`; shown in lists and workspace names. */
    identifier: z.string().min(1).max(128),
    /** Provider-side sequence number, when it has one. Feeds the numeric
     *  `WorkspaceLinkedItem.number` a linked workspace stores. */
    number: z.number().int().nonnegative().optional(),
    title: shortTextSchema,
    /** Markdown, never provider HTML — see the module header. */
    bodyMarkdown: z.string().max(PLUGIN_TASK_BODY_MAX_LENGTH).optional(),
    state: pluginTaskStateSchema,
    priority: z.enum(PLUGIN_TASK_PRIORITIES).optional(),
    assignees: z.array(pluginTaskMemberSchema).max(PLUGIN_TASK_PEOPLE_LIMIT).default([]),
    labels: z.array(pluginTaskLabelSchema).max(PLUGIN_TASK_LABEL_LIMIT).default([]),
    url: externalUrlSchema,
    createdAt: isoTimestampSchema.optional(),
    updatedAt: isoTimestampSchema.optional()
  })
  .strict()

export const pluginTaskCommentSchema = z
  .object({
    id: entityIdSchema,
    author: pluginTaskMemberSchema.nullable(),
    bodyMarkdown: z.string().max(PLUGIN_TASK_BODY_MAX_LENGTH),
    createdAt: isoTimestampSchema.optional(),
    updatedAt: isoTimestampSchema.optional()
  })
  .strict()

/** Presets every tracker can answer; free-text search is a separate field so a
 *  provider without full-text search can still serve the preset lists. */
export const PLUGIN_TASK_PRESETS = ['assigned', 'reported', 'open', 'completed', 'all'] as const
export type PluginTaskPreset = (typeof PLUGIN_TASK_PRESETS)[number]

export const pluginTaskQuerySchema = z
  .object({
    connectionId: entityIdSchema,
    scopeId: entityIdSchema.optional(),
    preset: z.enum(PLUGIN_TASK_PRESETS).default('open'),
    text: z.string().max(PLUGIN_TASK_TEXT_MAX_LENGTH).optional(),
    /** Opaque provider cursor echoed from a previous page. */
    cursor: z.string().max(2048).optional(),
    limit: z.number().int().min(1).max(PLUGIN_TASK_PAGE_LIMIT).default(50)
  })
  .strict()

export const pluginTaskWorkItemPageSchema = z
  .object({
    items: z.array(pluginTaskWorkItemSchema).max(PLUGIN_TASK_PAGE_LIMIT),
    /** Null means "no more pages" — an empty string would be ambiguous. */
    nextCursor: z.string().max(2048).nullable().default(null)
  })
  .strict()

/** Every field optional: a patch carries only what the user changed. */
export const pluginTaskWorkItemPatchSchema = z
  .object({
    title: shortTextSchema.optional(),
    bodyMarkdown: z.string().max(PLUGIN_TASK_BODY_MAX_LENGTH).optional(),
    stateId: entityIdSchema.optional(),
    priority: z.enum(PLUGIN_TASK_PRIORITIES).optional(),
    assigneeIds: z.array(entityIdSchema).max(PLUGIN_TASK_PEOPLE_LIMIT).optional(),
    labelIds: z.array(entityIdSchema).max(PLUGIN_TASK_LABEL_LIMIT).optional()
  })
  .strict()

export const pluginTaskWorkItemDraftSchema = z
  .object({
    connectionId: entityIdSchema,
    scopeId: entityIdSchema,
    title: shortTextSchema,
    bodyMarkdown: z.string().max(PLUGIN_TASK_BODY_MAX_LENGTH).optional(),
    stateId: entityIdSchema.optional(),
    priority: z.enum(PLUGIN_TASK_PRIORITIES).optional(),
    assigneeIds: z.array(entityIdSchema).max(PLUGIN_TASK_PEOPLE_LIMIT).optional(),
    labelIds: z.array(entityIdSchema).max(PLUGIN_TASK_LABEL_LIMIT).optional()
  })
  .strict()

/** Addresses one work item across the transport. */
export const pluginTaskWorkItemRefSchema = z
  .object({
    connectionId: entityIdSchema,
    scopeId: entityIdSchema,
    workItemId: entityIdSchema
  })
  .strict()

export type PluginTaskState = z.infer<typeof pluginTaskStateSchema>
export type PluginTaskLabel = z.infer<typeof pluginTaskLabelSchema>
export type PluginTaskMember = z.infer<typeof pluginTaskMemberSchema>
export type PluginTaskConnection = z.infer<typeof pluginTaskConnectionSchema>
export type PluginTaskScope = z.infer<typeof pluginTaskScopeSchema>
export type PluginTaskWorkItem = z.infer<typeof pluginTaskWorkItemSchema>
export type PluginTaskComment = z.infer<typeof pluginTaskCommentSchema>
export type PluginTaskQuery = z.infer<typeof pluginTaskQuerySchema>
export type PluginTaskWorkItemPage = z.infer<typeof pluginTaskWorkItemPageSchema>
export type PluginTaskWorkItemPatch = z.infer<typeof pluginTaskWorkItemPatchSchema>
export type PluginTaskWorkItemDraft = z.infer<typeof pluginTaskWorkItemDraftSchema>
export type PluginTaskWorkItemRef = z.infer<typeof pluginTaskWorkItemRefSchema>
