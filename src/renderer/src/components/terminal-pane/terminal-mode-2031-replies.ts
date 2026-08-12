import { mode2031SequenceFor } from '../../../../shared/terminal-color-scheme-protocol'
import type { TerminalColorSchemeMode } from '../../../../shared/terminal-color-scheme-protocol'
import type { PtyTransport } from './pty-transport'

type Mode2031ReplyTransport = Pick<PtyTransport, 'isConnected' | 'sendInputImmediate'>

function sendMode2031Reply(
  transport: Mode2031ReplyTransport,
  mode: TerminalColorSchemeMode
): boolean {
  // Why: fish stops reading mode-2031 replies quickly; remote input batching
  // can otherwise deliver this terminal response after the shell regains input.
  return transport.sendInputImmediate(mode2031SequenceFor(mode))
}

// The single owner of mode-2031 notifications (#9993): subscribing is silent, and xterm's own
// theme-write report is dropped. Appearance updates include font and opacity changes, so only
// report actual color-mode flips to programs that still have mode 2031 enabled. `mode` must come
// from resolveComposedTerminalColorSchemeMode (the palette the pane paints on), not the app mode.
export function maybePushMode2031Flip(
  paneId: number,
  mode: TerminalColorSchemeMode,
  transport: Mode2031ReplyTransport,
  paneMode2031: Map<number, boolean>,
  paneLastThemeMode: Map<number, TerminalColorSchemeMode>
): boolean {
  if (!transport.isConnected()) {
    return false
  }
  if (!paneMode2031.get(paneId)) {
    return false
  }
  if (paneLastThemeMode.get(paneId) === mode) {
    return false
  }
  if (!sendMode2031Reply(transport, mode)) {
    return false
  }
  paneLastThemeMode.set(paneId, mode)
  return true
}
