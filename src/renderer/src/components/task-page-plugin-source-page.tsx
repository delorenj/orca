import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { LoaderCircle, RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { findPluginTaskSource, usePluginTaskSources } from '@/store/plugin-task-sources'
import type {
  PluginTaskConnection,
  PluginTaskScope,
  PluginTaskWorkItem
} from '../../../shared/plugins/plugin-task-source-contract'
import type { PluginTaskSourceId } from '../../../shared/task-source-id'
import {
  pluginTaskConnections,
  pluginTaskScopes,
  pluginTaskWorkItems
} from '@/runtime/runtime-plugin-task-source-client'
import { PluginTaskSourceList } from './task-page-plugin-source-list'
import { pluginTaskWorkItemKey } from './task-page-plugin-source-state'

type PluginTaskSourcePageProps = {
  sourceId: PluginTaskSourceId
  onStartWorkspace: (item: PluginTaskWorkItem, sourceId: PluginTaskSourceId) => void
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error'

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function PluginTaskSourcePage({
  sourceId,
  onStartWorkspace
}: PluginTaskSourcePageProps): React.JSX.Element {
  const settings = useAppStore((state) => state.settings)
  const sources = usePluginTaskSources()
  const source = findPluginTaskSource(sources, sourceId)

  const [connections, setConnections] = useState<PluginTaskConnection[]>([])
  const [connectionId, setConnectionId] = useState<string | null>(null)
  const [scopes, setScopes] = useState<PluginTaskScope[]>([])
  const [scopeId, setScopeId] = useState<string | null>(null)
  const [items, setItems] = useState<PluginTaskWorkItem[]>([])
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [state, setState] = useState<LoadState>('idle')
  const [error, setError] = useState<string | null>(null)

  const runtimeSettings = useMemo(
    () => (settings ? { activeRuntimeEnvironmentId: settings.activeRuntimeEnvironmentId } : null),
    [settings]
  )

  const loadConnections = useCallback(async () => {
    setState('loading')
    setError(null)
    try {
      const result = await pluginTaskConnections(runtimeSettings, sourceId)
      setConnections(result.connections)
      const usable = result.connections.find((connection) => connection.connected)
      setConnectionId(usable?.id ?? null)
      setState('ready')
    } catch (loadError) {
      setError(describeError(loadError))
      setState('error')
    }
  }, [runtimeSettings, sourceId])

  useEffect(() => {
    void loadConnections()
  }, [loadConnections])

  useEffect(() => {
    if (!connectionId) {
      setScopes([])
      setScopeId(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const result = await pluginTaskScopes(runtimeSettings, sourceId, connectionId)
        if (cancelled) {
          return
        }
        setScopes(result.scopes)
        setScopeId((current) =>
          current && result.scopes.some((scope) => scope.id === current)
            ? current
            : (result.scopes[0]?.id ?? null)
        )
      } catch (scopeError) {
        if (!cancelled) {
          setError(describeError(scopeError))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [connectionId, runtimeSettings, sourceId])

  const loadItems = useCallback(async () => {
    if (!connectionId || !scopeId) {
      setItems([])
      return
    }
    setState('loading')
    setError(null)
    try {
      const page = await pluginTaskWorkItems(runtimeSettings, sourceId, {
        connectionId,
        scopeId,
        preset: 'open',
        limit: 50
      })
      setItems(page.items)
      setState('ready')
    } catch (itemsError) {
      setError(describeError(itemsError))
      setState('error')
    }
  }, [connectionId, runtimeSettings, scopeId, sourceId])

  useEffect(() => {
    void loadItems()
  }, [loadItems])

  const activeConnection = connections.find((connection) => connection.id === connectionId) ?? null

  if (!source) {
    return (
      <EmptyState
        message={translate(
          'auto.components.TaskPage.pluginSourceUnavailable',
          'This task source is not available. Enable its plugin in Settings → Plugins.'
        )}
      />
    )
  }

  return (
    <div className="flex min-h-0 max-h-full flex-col overflow-hidden rounded-md rounded-t-none border border-t-0 border-border/50 bg-background shadow-sm">
      <div className="flex h-10 flex-none items-center gap-2 border-b border-border/50 bg-muted/35 px-3">
        <Select value={connectionId ?? ''} onValueChange={setConnectionId}>
          <SelectTrigger className="h-7 w-[180px] text-xs">
            <SelectValue
              placeholder={translate(
                'auto.components.TaskPage.pluginSelectConnection',
                'Select a connection'
              )}
            />
          </SelectTrigger>
          <SelectContent>
            {connections.map((connection) => (
              <SelectItem key={connection.id} value={connection.id}>
                {connection.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={scopeId ?? ''} onValueChange={setScopeId} disabled={scopes.length === 0}>
          <SelectTrigger className="h-7 w-[200px] text-xs">
            <SelectValue
              placeholder={translate(
                'auto.components.TaskPage.pluginSelectScope',
                'Select a project'
              )}
            />
          </SelectTrigger>
          <SelectContent>
            {scopes.map((scope) => (
              <SelectItem key={scope.id} value={scope.id}>
                {scope.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-1">
          {state === 'loading' ? (
            <LoaderCircle className="size-3.5 animate-spin text-muted-foreground" />
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            aria-label={translate('auto.components.TaskPage.pluginRefresh', 'Refresh')}
            onClick={() => void loadItems()}
          >
            <RefreshCw className="size-3.5" />
          </Button>
        </div>
      </div>

      {activeConnection?.error ? (
        <EmptyState message={activeConnection.error} />
      ) : error ? (
        <EmptyState message={error} />
      ) : connections.length === 0 && state === 'ready' ? (
        <EmptyState
          message={translate(
            'auto.components.TaskPage.pluginNoConnections',
            'No connections yet. Add one in Settings → Tasks.'
          )}
        />
      ) : items.length === 0 && state === 'ready' ? (
        <EmptyState
          message={translate('auto.components.TaskPage.pluginNoItems', 'No open work items here.')}
        />
      ) : (
        <PluginTaskSourceList
          items={items}
          selectedItemKey={selectedKey}
          onOpenItem={(item) => {
            setSelectedKey(pluginTaskWorkItemKey(item))
            void window.api.shell.openUrl(item.url)
          }}
          onStartWorkspace={(item) => onStartWorkspace(item, sourceId)}
        />
      )}
    </div>
  )
}

function EmptyState({ message }: { message: string }): React.JSX.Element {
  return (
    <div className="mt-4 flex flex-col items-center justify-center rounded-md border border-border/50 bg-muted/50 px-6 py-14 text-center text-sm text-muted-foreground shadow-sm">
      {message}
    </div>
  )
}
