import { mode2031SequenceFor } from '../../../src/shared/terminal-color-scheme-protocol'

/**
 * WebView twin of the desktop's `xterm-theme-write-color-scheme-push` suppression.
 *
 * Writing `term.options.theme` makes xterm re-report the color scheme
 * (ThemeService.onChangeColors -> CoreBrowserTerminal._reportColorScheme -> onData)
 * whenever a program armed DECSET 2031, and this WebView forwards onData to native,
 * which writes it into the host PTY. Without this gate a theme toggle with a phone
 * attached delivers TWO `CSI ?997;Nn` to the shell: the desktop's maybePushMode2031Flip
 * (the single owner — it knows the app's resolved mode) plus the phone's report, which
 * would anyway describe the phone's theme rather than the host's (#9993).
 *
 * Answers to the program's own `CSI ?996n` are untouched: no theme write is in flight
 * for those, and the whole write -> report chain is synchronous, so the suppression
 * window is exactly the theme write and never leaks past it.
 */
export const TERMINAL_COLOR_SCHEME_PUSH_JS = `
  var MODE_2031_DARK_REPORT = ${JSON.stringify(mode2031SequenceFor('dark'))};
  var MODE_2031_LIGHT_REPORT = ${JSON.stringify(mode2031SequenceFor('light'))};
  var xtermColorSchemePushSuppressionDepth = 0;

  function withSuppressedXtermColorSchemePush(writeTheme) {
    xtermColorSchemePushSuppressionDepth += 1;
    try {
      return writeTheme();
    } finally {
      xtermColorSchemePushSuppressionDepth -= 1;
    }
  }

  function isSuppressedXtermColorSchemePush(data) {
    return xtermColorSchemePushSuppressionDepth > 0 &&
      (data === MODE_2031_DARK_REPORT || data === MODE_2031_LIGHT_REPORT);
  }
`
