import React from 'react'
import { ArrowRight, ExternalLink } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { PluginTaskWorkItem } from '../../../shared/plugins/plugin-task-source-contract'
import {
  groupPluginTaskWorkItems,
  pluginTaskStateTone,
  pluginTaskWorkItemKey,
  sortPluginTaskWorkItems
} from './task-page-plugin-source-state'

type PluginTaskSourceListProps = {
  items: readonly PluginTaskWorkItem[]
  selectedItemKey: string | null
  onOpenItem: (item: PluginTaskWorkItem) => void
  onStartWorkspace: (item: PluginTaskWorkItem) => void
}

// Why a catalog, not a module const: a top-level translate() captures the
// string at import time and stops following a language change.
const getGroupLabels = createLocalizedCatalog(
  (): Record<string, string> => ({
    started: translate('auto.components.TaskPage.pluginGroupStarted', 'In progress'),
    unstarted: translate('auto.components.TaskPage.pluginGroupUnstarted', 'Todo'),
    backlog: translate('auto.components.TaskPage.pluginGroupBacklog', 'Backlog'),
    completed: translate('auto.components.TaskPage.pluginGroupCompleted', 'Done'),
    cancelled: translate('auto.components.TaskPage.pluginGroupCancelled', 'Cancelled')
  })
)

export function PluginTaskSourceList({
  items,
  selectedItemKey,
  onOpenItem,
  onStartWorkspace
}: PluginTaskSourceListProps): React.JSX.Element {
  const groupLabels = getGroupLabels()
  const sections = groupPluginTaskWorkItems(sortPluginTaskWorkItems(items))

  return (
    <div className="scrollbar-sleek flex min-h-0 flex-1 flex-col overflow-y-auto">
      {sections.map((section) => (
        <div key={section.key} className="flex flex-col">
          <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border/50 bg-muted/35 px-3 py-1.5 text-xs font-medium text-muted-foreground">
            <span
              className={cn('size-1.5 rounded-full bg-current', pluginTaskStateTone(section.key))}
            />
            {groupLabels[section.key] ?? section.key}
            <span className="text-muted-foreground/70">{section.items.length}</span>
          </div>
          {section.items.map((item) => {
            const key = pluginTaskWorkItemKey(item)
            return (
              <button
                key={key}
                type="button"
                onClick={() => onOpenItem(item)}
                className={cn(
                  'group flex items-start gap-3 border-b border-border/40 px-3 py-2 text-left transition-colors hover:bg-accent/50',
                  selectedItemKey === key && 'bg-accent'
                )}
              >
                <span className="mt-0.5 shrink-0 font-mono text-xs text-muted-foreground">
                  {item.identifier}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-foreground">{item.title}</span>
                  <span className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className={pluginTaskStateTone(item.state.group)}>{item.state.name}</span>
                    {item.assignees.length > 0 ? (
                      <span className="truncate">
                        {item.assignees.map((assignee) => assignee.name).join(', ')}
                      </span>
                    ) : null}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={translate(
                      'auto.components.TaskPage.pluginOpenExternal',
                      'Open in browser'
                    )}
                    onClick={(event) => {
                      event.stopPropagation()
                      void window.api.shell.openUrl(item.url)
                    }}
                  >
                    <ExternalLink className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={translate(
                      'auto.components.TaskPage.pluginStartWorkspace',
                      'Start workspace'
                    )}
                    onClick={(event) => {
                      event.stopPropagation()
                      onStartWorkspace(item)
                    }}
                  >
                    <ArrowRight className="size-3.5" />
                  </Button>
                </span>
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
