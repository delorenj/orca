import type { RefinementCtx } from 'zod'
import { isPluginCommandAliasActionId } from './plugin-command-actions'
import { getKeybindingConflictIdentity } from '../keybindings'

type IdentifiedContribution = { id: string }
type PathContribution = { path: string }

type ContributionValidationManifest = {
  main?: string
  contributes: {
    panels: IdentifiedContribution[]
    commands: (IdentifiedContribution & { action?: string; context?: 'global' | 'worktree' })[]
    events: { on: string }[]
    languagePacks: { locale: string }[]
    keybindings: { command: string; key: string; when?: 'global' | 'worktree' }[]
    vmRecipes: PathContribution[]
    agents: PathContribution[]
    taskSources: (IdentifiedContribution & {
      connectionFields: { key: string; kind: string }[]
    })[]
  }
  capabilities: { kind: string }[]
}

function rejectDuplicateValues(
  entries: readonly unknown[],
  valueOf: (entry: unknown) => string,
  path: string,
  label: string,
  ctx: RefinementCtx
): void {
  const seen = new Set<string>()
  for (const [index, entry] of entries.entries()) {
    const value = valueOf(entry)
    if (seen.has(value)) {
      ctx.addIssue({
        code: 'custom',
        path: ['contributes', path, index],
        message: `duplicate ${label}: ${value}`
      })
    }
    seen.add(value)
  }
}

export function validatePluginManifestContributions(
  manifest: ContributionValidationManifest,
  ctx: RefinementCtx
): void {
  for (const path of ['panels', 'commands', 'taskSources'] as const) {
    rejectDuplicateValues(
      manifest.contributes[path],
      (entry) => (entry as IdentifiedContribution).id,
      path,
      `${path} id`,
      ctx
    )
  }
  rejectDuplicateValues(
    manifest.contributes.languagePacks,
    (entry) => (entry as { locale: string }).locale.toLowerCase(),
    'languagePacks',
    'language pack locale',
    ctx
  )
  for (const path of ['vmRecipes', 'agents'] as const) {
    rejectDuplicateValues(
      manifest.contributes[path],
      (entry) => (entry as PathContribution).path,
      path,
      `${path} path`,
      ctx
    )
  }
  const keybindingIdentities = new Set<string>()
  for (const [index, keybinding] of manifest.contributes.keybindings.entries()) {
    const identities = (['darwin', 'linux', 'win32'] as const).map((platform) =>
      getKeybindingConflictIdentity(keybinding.key, platform)
    )
    if (identities.some((identity) => keybindingIdentities.has(identity))) {
      ctx.addIssue({
        code: 'custom',
        path: ['contributes', 'keybindings', index],
        message: `duplicate keybinding: ${keybinding.key.toLowerCase()}`
      })
    }
    identities.forEach((identity) => keybindingIdentities.add(identity))
  }

  const commands = new Map(manifest.contributes.commands.map((command) => [command.id, command]))
  for (const [index, command] of manifest.contributes.commands.entries()) {
    if (command.action !== undefined && !isPluginCommandAliasActionId(command.action)) {
      ctx.addIssue({
        code: 'custom',
        path: ['contributes', 'commands', index, 'action'],
        message: `unknown built-in action: ${command.action}`
      })
    }
  }
  for (const [index, keybinding] of manifest.contributes.keybindings.entries()) {
    const command = commands.get(keybinding.command)
    if (!command) {
      ctx.addIssue({
        code: 'custom',
        path: ['contributes', 'keybindings', index, 'command'],
        message: `unknown contributed command: ${keybinding.command}`
      })
      continue
    }
    const commandContext = command.context ?? 'global'
    if (keybinding.when !== undefined && keybinding.when !== commandContext) {
      ctx.addIssue({
        code: 'custom',
        path: ['contributes', 'keybindings', index, 'when'],
        message: 'keybinding context must match its command context'
      })
    }
  }

  if (
    !manifest.main &&
    manifest.contributes.commands.some((command) => command.action === undefined)
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['main'],
      message: 'required when contributes.commands contains a worker command'
    })
  }
  if (!manifest.main && manifest.contributes.events.length > 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['main'],
      message: 'required when contributes.events is non-empty'
    })
  }
  if (
    manifest.contributes.events.length > 0 &&
    !manifest.capabilities.some((capability) => capability.kind === 'events:subscribe')
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['capabilities'],
      message: 'events:subscribe capability required when contributes.events is non-empty'
    })
  }
  validateTaskSourceContributions(manifest, ctx)
}

function validateTaskSourceContributions(
  manifest: ContributionValidationManifest,
  ctx: RefinementCtx
): void {
  const taskSources = manifest.contributes.taskSources
  if (taskSources.length === 0) {
    return
  }
  // A task source is answered entirely by worker code; there is no declarative
  // form of it, so a manifest without `main` could never serve one.
  if (!manifest.main) {
    ctx.addIssue({
      code: 'custom',
      path: ['main'],
      message: 'required when contributes.taskSources is non-empty'
    })
  }
  const hasCapability = (kind: string): boolean =>
    manifest.capabilities.some((capability) => capability.kind === kind)
  if (!hasCapability('tasks:provide')) {
    ctx.addIssue({
      code: 'custom',
      path: ['capabilities'],
      message: 'tasks:provide capability required when contributes.taskSources is non-empty'
    })
  }
  for (const [index, source] of taskSources.entries()) {
    rejectDuplicateValues(
      source.connectionFields,
      (entry) => (entry as { key: string }).key,
      `taskSources.${index}.connectionFields`,
      'connection field key',
      ctx
    )
    // Credentials must land in the encrypted vault, so declaring a secret
    // field without the capability would fail only at connect time.
    if (
      source.connectionFields.some((field) => field.kind === 'password') &&
      !hasCapability('secrets')
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['capabilities'],
        message: 'secrets capability required for a password connection field'
      })
    }
  }
}
