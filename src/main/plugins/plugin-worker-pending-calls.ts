/**
 * Request/response bookkeeping for one fork IPC lane: allocate a call id, arm
 * a timeout, hand the id to the sender, and settle when the reply arrives.
 *
 * Extracted because commands and extension calls run identical lanes with
 * different message shapes — one copy keeps their timeout and teardown
 * behavior from drifting apart.
 */

type PendingCall = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export type PluginWorkerCallOutcome = {
  ok: boolean
  value?: unknown
  error?: string
}

export type PluginWorkerPendingCalls = {
  /** Sends via `send(callId)` and resolves when `settle` sees that id. */
  track(
    timeoutMs: number,
    describeTimeout: () => string,
    send: (callId: number) => void
  ): Promise<unknown>
  /** False when the id is unknown (a late reply after teardown). */
  settle(callId: number, outcome: PluginWorkerCallOutcome, fallbackError: string): boolean
  rejectAll(reason: string): void
  size(): number
}

export function createPluginWorkerPendingCalls(): PluginWorkerPendingCalls {
  const pending = new Map<number, PendingCall>()
  let nextCallId = 0

  return {
    track(timeoutMs, describeTimeout, send) {
      const callId = nextCallId++
      return new Promise<unknown>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(callId)
          reject(new Error(describeTimeout()))
        }, timeoutMs)
        pending.set(callId, { resolve, reject, timer })
        send(callId)
      })
    },
    settle(callId, outcome, fallbackError) {
      const entry = pending.get(callId)
      if (!entry) {
        return false
      }
      clearTimeout(entry.timer)
      pending.delete(callId)
      if (outcome.ok) {
        entry.resolve(outcome.value)
      } else {
        entry.reject(new Error(outcome.error ?? fallbackError))
      }
      return true
    },
    rejectAll(reason) {
      for (const [callId, entry] of pending) {
        clearTimeout(entry.timer)
        pending.delete(callId)
        entry.reject(new Error(reason))
      }
    },
    size: () => pending.size
  }
}
