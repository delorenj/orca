import type { TaskSourceId } from '../../../shared/task-source-id'
import { isPluginTaskSourceId } from '../../../shared/task-source-id'

export type TaskPageListChromeVisibilityState = {
  taskSource: TaskSourceId
  hasGitHubDetail: boolean
  hasGitLabDetail: boolean
  hasJiraDetail: boolean
  hasLinearIssueDetail: boolean
  hasLinearProjectContext: boolean
  hasLinearViewContext: boolean
  hasPluginSourceDetail: boolean
}

export function shouldHideTaskPageListChrome({
  taskSource,
  hasGitHubDetail,
  hasGitLabDetail,
  hasJiraDetail,
  hasLinearIssueDetail,
  hasLinearProjectContext,
  hasLinearViewContext,
  hasPluginSourceDetail
}: TaskPageListChromeVisibilityState): boolean {
  if (isPluginTaskSourceId(taskSource)) {
    return hasPluginSourceDetail
  }
  // Why: provider-specific selection can intentionally survive source switches;
  // stale detail state from another provider must not hide the active list chrome.
  switch (taskSource) {
    case 'github':
      return hasGitHubDetail
    case 'gitlab':
      return hasGitLabDetail
    case 'jira':
      return hasJiraDetail
    case 'linear':
      return hasLinearIssueDetail || hasLinearProjectContext || hasLinearViewContext
  }
}
