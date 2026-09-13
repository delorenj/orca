import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, posix } from 'node:path'
import type { SFTPWrapper } from 'ssh2'
import type { AgentHookInstallStatus, AgentHookTarget } from '../../shared/agent-hook-types'
import { readTextFileRemote } from './installer-utils-remote'

const OWNERSHIP_PATH = ['.config', '33god', 'hook-hub', 'ownership.json']

function ownedAgents(content: string | null): Set<string> {
  try {
    const data = JSON.parse(content ?? '') as Record<string, unknown>
    if (
      data.version !== 1 ||
      !Array.isArray(data.handler_ids) ||
      !data.handler_ids.includes('orca-status') ||
      !Array.isArray(data.clis)
    ) {
      return new Set()
    }
    return new Set(data.clis.filter((value): value is string => typeof value === 'string'))
  } catch {
    return new Set()
  }
}

export function externalHookOwner(agent: AgentHookTarget, home = homedir()): string | null {
  const path = process.env.BB_HOOK_OWNERSHIP || join(home, ...OWNERSHIP_PATH)
  try {
    return ownedAgents(readFileSync(path, 'utf8')).has(agent) ? path : null
  } catch {
    return null
  }
}

export async function remoteExternalHookOwners(
  sftp: SFTPWrapper,
  home: string
): Promise<{ path: string; agents: Set<string> }> {
  const path = posix.join(home, ...OWNERSHIP_PATH)
  try {
    return { path, agents: ownedAgents(await readTextFileRemote(sftp, path)) }
  } catch {
    return { path, agents: new Set() }
  }
}

export function externalHookOwnerStatus(
  agent: AgentHookTarget,
  path: string
): AgentHookInstallStatus {
  return {
    agent,
    state: 'skipped',
    skipReason: 'hooks_disabled',
    configPath: path,
    managedHooksPresent: false,
    detail: 'Hook hub owns Orca status for this CLI.'
  }
}
