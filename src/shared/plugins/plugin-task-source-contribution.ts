import { z } from 'zod'
import { pluginIdSchema } from './plugin-manifest-fields'
import { PLUGIN_TASK_SOURCE_FEATURES } from './plugin-task-source-methods'

/**
 * `contributes.taskSources` — a plugin declaring itself as a tracker Orca can
 * render natively.
 *
 * `connectionFields` is what keeps plugins out of the UI business entirely:
 * the plugin describes what a connection needs, Orca draws the form with its
 * own components, and `password` values land in the plugin's encrypted vault
 * without the renderer ever holding them. A sandboxed panel could not do this
 * — its CSP forbids network access and it cannot call its own worker.
 */

export const PLUGIN_TASK_SOURCE_LIMIT = 8
export const PLUGIN_TASK_CONNECTION_FIELD_LIMIT = 12

export const PLUGIN_TASK_CONNECTION_FIELD_KINDS = ['text', 'url', 'password'] as const
export type PluginTaskConnectionFieldKind = (typeof PLUGIN_TASK_CONNECTION_FIELD_KINDS)[number]

export const pluginTaskConnectionFieldSchema = z
  .object({
    /** Stored verbatim as the settings/secret key for this field. */
    key: pluginIdSchema,
    label: z.string().min(1).max(256),
    kind: z.enum(PLUGIN_TASK_CONNECTION_FIELD_KINDS),
    required: z.boolean().default(true),
    placeholder: z.string().max(256).optional(),
    /** Rendered under the input; the place to explain where a key comes from. */
    hint: z.string().max(512).optional()
  })
  .strict()

export const pluginTaskSourceContributionSchema = z
  .object({
    id: pluginIdSchema,
    title: z.string().min(1).max(256),
    /** Lucide icon name shown in the task-source selector. Remote images are
     *  impossible by design (no plugin-supplied asset reaches the renderer). */
    icon: z.string().min(1).max(64).optional(),
    features: z
      .array(z.enum(PLUGIN_TASK_SOURCE_FEATURES))
      .max(PLUGIN_TASK_SOURCE_FEATURES.length)
      .default([]),
    connectionFields: z
      .array(pluginTaskConnectionFieldSchema)
      .min(1)
      .max(PLUGIN_TASK_CONNECTION_FIELD_LIMIT)
  })
  .strict()

export type PluginTaskConnectionField = z.infer<typeof pluginTaskConnectionFieldSchema>
export type PluginTaskSourceContribution = z.infer<typeof pluginTaskSourceContributionSchema>

/** Provider id Orca addresses a contributed source by:
 *  `plugin:<publisher>.<pluginId>/<sourceId>`. Mirrors `pluginPanelTabKey`. */
export function pluginTaskProviderKey(qualifiedKey: string, sourceId: string): `plugin:${string}` {
  return `plugin:${qualifiedKey}/${sourceId}`
}
