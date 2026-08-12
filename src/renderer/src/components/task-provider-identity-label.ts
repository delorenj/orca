import type { TaskProviderIdentity } from '../../../shared/task-source-context'

/**
 * Human label for the account/repo a task-source context is bound to.
 *
 * Keys off `TaskProviderIdentity`, which stays a built-in-only union: a plugin
 * source's connection is described by the plugin itself, so there is no
 * identity to label here.
 */
export function getProviderIdentityLabel(
  identity: TaskProviderIdentity | null | undefined
): string | null {
  if (!identity) {
    return null
  }
  switch (identity.provider) {
    case 'github':
      return `${identity.owner}/${identity.repo}`
    case 'gitlab':
      return identity.namespace && identity.project
        ? `${identity.namespace}/${identity.project}`
        : (identity.projectId ?? null)
    case 'linear':
      return identity.workspaceName ?? identity.workspaceId ?? null
    case 'jira':
      return identity.siteUrl ?? identity.siteId ?? null
  }
}
