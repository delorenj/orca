import { isMode2031ColorSchemeReport } from '../../../../shared/terminal-color-scheme-protocol'

/**
 * Suppression window for xterm's own DECSET 2031 notification.
 *
 * Writing `terminal.options.theme` makes xterm re-report the color scheme
 * (ThemeService.onChangeColors → CoreBrowserTerminal._reportColorScheme →
 * onData) whenever a program armed mode 2031. Orca already pushes that flip
 * from its own subscription registry (maybePushMode2031Flip), which is the only
 * emitter that covers hidden/parked panes and every pane the write touched —
 * so the emulator's copy is dropped, otherwise a subscribed TUI reads the
 * doubled `^[[?997;1n^[[?997;1n` (#9993). The whole chain is synchronous, so
 * the window is exactly the theme write and never leaks past it.
 */
let suppressionDepth = 0

export function withSuppressedXtermColorSchemePush<T>(writeTheme: () => T): T {
  suppressionDepth += 1
  try {
    return writeTheme()
  } finally {
    suppressionDepth -= 1
  }
}

export function isXtermColorSchemePushSuppressed(): boolean {
  return suppressionDepth > 0
}

/** The whole drop rule, so the pane input path and its tests share one predicate.
 *  A program's own `CSI ?996n` answer is untouched: no theme write is in flight for those. */
export function shouldDropXtermColorSchemePush(data: string): boolean {
  return suppressionDepth > 0 && isMode2031ColorSchemeReport(data)
}
