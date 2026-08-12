import { describe, expect, it } from 'vitest'
import {
  buildShellCommandFromArgv,
  clearEnvCommand,
  commandSeparator,
  isPosixStartupShell,
  quoteStartupArg,
  resolveLoginShellStartupDialect,
  tokenizeStartupCommand
} from './tui-agent-startup-shell'
import { buildAgentDraftLaunchPlan } from './tui-agent-startup'

describe('fish startup shell dialect', () => {
  it('clears variables with fish syntax instead of the sh `unset` fish rejects', () => {
    expect(clearEnvCommand('CODEX_HOME', 'fish')).toBe('set -e CODEX_HOME')
    expect(clearEnvCommand('CODEX_HOME', 'posix')).toBe('unset CODEX_HOME')
    expect(clearEnvCommand('CODEX_HOME', 'cmd')).toBe('set "CODEX_HOME="')
    expect(clearEnvCommand('CODEX_HOME', 'powershell')).toBe(
      'Remove-Item Env:CODEX_HOME -ErrorAction SilentlyContinue'
    )
  })

  it('shares POSIX quoting, tokenizing and chaining', () => {
    expect(quoteStartupArg("it's", 'fish')).toBe(quoteStartupArg("it's", 'posix'))
    expect(buildShellCommandFromArgv(['codex', 'resume', 'a b'], 'fish')).toBe(
      buildShellCommandFromArgv(['codex', 'resume', 'a b'], 'posix')
    )
    expect(tokenizeStartupCommand('codex --arg "a b"', 'fish')).toEqual(
      tokenizeStartupCommand('codex --arg "a b"', 'posix')
    )
    expect(commandSeparator('fish')).toBe('; ')
    expect(isPosixStartupShell('fish')).toBe(true)
  })

  it('maps login shell paths to their dialect', () => {
    expect(resolveLoginShellStartupDialect('/opt/homebrew/bin/fish')).toBe('fish')
    expect(resolveLoginShellStartupDialect('/usr/local/bin/FISH')).toBe('fish')
    expect(resolveLoginShellStartupDialect('/bin/zsh')).toBe('posix')
    expect(resolveLoginShellStartupDialect('/bin/bash')).toBe('posix')
    expect(resolveLoginShellStartupDialect('')).toBe('posix')
    expect(resolveLoginShellStartupDialect(undefined)).toBe('posix')
  })

  it('clears an agent draft prefill variable with fish syntax', () => {
    const plan = buildAgentDraftLaunchPlan({
      agent: 'pi',
      draft: 'hello',
      cmdOverrides: {},
      platform: 'darwin',
      shell: 'fish'
    })

    expect(plan?.launchCommand).toBe('pi; set -e ORCA_PI_PREFILL')
    expect(plan?.env?.ORCA_PI_PREFILL).toBe('hello')
  })
})
