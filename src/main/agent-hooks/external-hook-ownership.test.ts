import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAgentHookMemorySftp } from './agent-hook-memory-sftp.test-fixture'
import { externalHookOwner, remoteExternalHookOwners } from './external-hook-ownership'
import { installRemoteManagedAgentHooks } from './remote-managed-hook-installers'

describe('external hook ownership', () => {
  let home: string
  let manifest: string

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'orca-hook-owner-'))
    manifest = join(home, '.config', '33god', 'hook-hub', 'ownership.json')
    mkdirSync(dirname(manifest), { recursive: true })
    vi.stubEnv('BB_HOOK_OWNERSHIP', manifest)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    rmSync(home, { recursive: true, force: true })
  })

  it('requires an explicit completed cutover for both the CLI and concern', () => {
    expect(externalHookOwner('claude', home)).toBeNull()
    writeFileSync(manifest, JSON.stringify({ version: 1, clis: ['claude'], handler_ids: [] }))
    expect(externalHookOwner('claude', home)).toBeNull()
    writeFileSync(
      manifest,
      JSON.stringify({ version: 1, clis: ['claude'], handler_ids: ['orca-status'] })
    )
    expect(externalHookOwner('claude', home)).toBe(manifest)
    expect(externalHookOwner('codex', home)).toBeNull()
    writeFileSync(manifest, 'invalid')
    expect(externalHookOwner('claude', home)).toBeNull()
  })

  it('reads ownership on the destination host and skips config mutation over SSH', async () => {
    const path = '/remote/home/.config/33god/hook-hub/ownership.json'
    const { sftp, fs } = createAgentHookMemorySftp({
      [path]: JSON.stringify({ version: 1, clis: ['hermes'], handler_ids: ['orca-status'] })
    })
    const owner = await remoteExternalHookOwners(sftp, '/remote/home')
    expect([...owner.agents]).toEqual(['hermes'])
    const results = await installRemoteManagedAgentHooks(sftp, '/remote/home', {
      agents: ['hermes']
    })
    expect(results).toEqual([expect.objectContaining({ state: 'skipped', configPath: path })])
    expect([...fs.files.keys()]).toEqual([path])
  })
})
