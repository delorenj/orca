import { describe, expect, it, vi } from 'vitest'
import type { AppState } from '@/store/types'

vi.mock('@/lib/new-workspace', () => ({
  CLIENT_PLATFORM: 'darwin'
}))

const clientLoginShell = vi.hoisted(() => ({ value: '' }))

vi.mock('@/lib/client-login-shell', () => ({
  getClientLoginShell: () => clientLoginShell.value
}))

import { buildAiVaultResumeCopyCommandForWorktree } from './ai-vault-resume-command'
import { resolveAiVaultResumeStartupShell } from './ai-vault-resume-shell'

type ResumeShellState = Parameters<typeof buildAiVaultResumeCopyCommandForWorktree>[0]['state']

function makeState(): ResumeShellState {
  return {
    activeRepoId: 'repo-1',
    activeWorktreeId: 'repo-1::worktree-1',
    folderWorkspaces: [],
    projectGroups: [],
    repos: [{ id: 'repo-1', path: '/home/alice/repo' }],
    projects: [{ id: 'repo-1', sourceRepoIds: ['repo-1'] }],
    settings: {
      agentDefaultArgs: { codex: '' },
      agentDefaultEnv: { codex: {} }
    },
    worktreesByRepo: {
      'repo-1': [
        {
          id: 'repo-1::worktree-1',
          repoId: 'repo-1',
          path: '/home/alice/repo'
        }
      ]
    }
  } as unknown as AppState
}

function withLoginShell<T>(shell: string, run: () => T): T {
  clientLoginShell.value = shell
  try {
    return run()
  } finally {
    clientLoginShell.value = ''
  }
}

describe('resolveAiVaultResumeStartupShell', () => {
  it('reports the fish dialect for a local session under a fish login shell', () => {
    expect(
      withLoginShell('/opt/homebrew/bin/fish', () =>
        resolveAiVaultResumeStartupShell({
          state: makeState(),
          worktreeId: 'repo-1::worktree-1',
          platform: 'darwin',
          isLocalSession: true
        })
      )
    ).toBe('fish')
  })

  it('stays on sh for zsh users and for remote sessions', () => {
    expect(
      withLoginShell('/bin/zsh', () =>
        resolveAiVaultResumeStartupShell({
          state: makeState(),
          worktreeId: 'repo-1::worktree-1',
          platform: 'darwin',
          isLocalSession: true
        })
      )
    ).toBe('posix')

    // Why: the remote host's login shell is unknown; sh is the safe default.
    expect(
      withLoginShell('/opt/homebrew/bin/fish', () =>
        resolveAiVaultResumeStartupShell({
          state: makeState(),
          worktreeId: 'repo-1::worktree-1',
          platform: 'linux',
          isLocalSession: false
        })
      )
    ).toBe('posix')
  })
})

describe('copied real-home Codex resume command', () => {
  const session = {
    agent: 'codex' as const,
    sessionId: 'session one',
    cwd: '/home/alice/repo',
    codexHome: null
  }

  it('clears inherited Codex homes with fish syntax under a fish login shell', () => {
    expect(
      withLoginShell('/opt/homebrew/bin/fish', () =>
        buildAiVaultResumeCopyCommandForWorktree({
          state: makeState(),
          worktreeId: 'repo-1::worktree-1',
          session
        })
      )
    ).toBe(
      "set -e CODEX_HOME; set -e ORCA_CODEX_HOME; cd '/home/alice/repo' && codex 'resume' 'session one'"
    )
  })

  it('keeps `unset` for sh-family login shells', () => {
    expect(
      withLoginShell('/bin/bash', () =>
        buildAiVaultResumeCopyCommandForWorktree({
          state: makeState(),
          worktreeId: 'repo-1::worktree-1',
          session
        })
      )
    ).toBe(
      "unset CODEX_HOME; unset ORCA_CODEX_HOME; cd '/home/alice/repo' && codex 'resume' 'session one'"
    )
  })
})
