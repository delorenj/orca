// The phone is a second live CSI 997 emitter: its xterm re-reports the color scheme on every
// `term.options.theme` write, and the WebView forwards onData to native, which writes it into
// the host PTY. Desktop's maybePushMode2031Flip is the single owner of that push (#9993), so a
// theme toggle with a phone attached must still deliver exactly one report to the shell.
import { Script } from 'node:vm'
import { parse } from 'acorn'
import { describe, expect, it } from 'vitest'
import { TERMINAL_COLOR_SCHEME_PUSH_JS } from './terminal-webview-color-scheme-push-injected'
import { TERMINAL_QUERY_REPLY_JS } from './terminal-webview-query-reply-injected'
import { TERMINAL_WEBVIEW_THEME_JS } from './terminal-webview-theme-injected'
import { XTERM_WEBVIEW_SOURCE } from './terminal-webview-html'

const DARK_REPORT = '\x1b[?997;1n'
const CURSOR_POSITION_REPORT = '\x1b[24;1R'

type WebViewGate = {
  forwarded: unknown[]
  forward: (data: string) => void
  withSuppressedWrite: (write: () => void) => void
}

/** The injected units that share the WebView IIFE, minus the emulator. */
function loadGate(extra: Record<string, unknown> = {}): Record<string, unknown> & WebViewGate {
  const forwarded: unknown[] = []
  const context: Record<string, unknown> = {
    defaultTheme: { background: '#1a1b26', foreground: '#c0caf5' },
    notify: (message: unknown) => forwarded.push(message),
    enqueueWriteBoundary: () => {},
    ...extra
  }
  new Script(TERMINAL_COLOR_SCHEME_PUSH_JS).runInNewContext(context)
  new Script(TERMINAL_QUERY_REPLY_JS).runInNewContext(context)
  new Script(TERMINAL_WEBVIEW_THEME_JS).runInNewContext(context)
  ;(context.resumeTerminalDataReplyAuthority as () => void)()
  return Object.assign(context, {
    forwarded,
    forward: context.forwardTerminalDataReply as (data: string) => void,
    withSuppressedWrite: context.withSuppressedXtermColorSchemePush as (write: () => void) => void
  })
}

/**
 * A `term` stand-in whose theme setter re-reports the color scheme exactly as xterm's
 * ThemeService.onChangeColors -> _reportColorScheme -> onData chain does once a program
 * armed DECSET 2031. minimumContrastRatio deliberately reports nothing: xterm only clears
 * its contrast cache for that option.
 */
function loadThemedWebView(): Record<string, unknown> & WebViewGate {
  const options: Record<string, unknown> = { minimumContrastRatio: 1 }
  let gate: (Record<string, unknown> & WebViewGate) | null = null
  Object.defineProperty(options, 'theme', {
    enumerable: true,
    get: () => undefined,
    set: () => gate?.forward(DARK_REPORT)
  })
  gate = loadGate({
    term: { options },
    document: {
      documentElement: { style: { background: '' } },
      body: { style: { background: '' } }
    }
  })
  return gate
}

describe('mobile WebView color-scheme push gate (#9993)', () => {
  it('parses at the Chrome 74 syntax floor', () => {
    expect(() => parse(TERMINAL_COLOR_SCHEME_PUSH_JS, { ecmaVersion: 2019 })).not.toThrow()
  })

  it('ships inside the same IIFE as the query-reply bridge that consumes it', () => {
    const definitionIndex = XTERM_WEBVIEW_SOURCE.html.indexOf(
      'function isSuppressedXtermColorSchemePush(data)'
    )
    const callIndex = XTERM_WEBVIEW_SOURCE.html.indexOf(
      'if (isSuppressedXtermColorSchemePush(data)) return;'
    )

    expect(definitionIndex).toBeGreaterThan(-1)
    expect(callIndex).toBeGreaterThan(definitionIndex)
  })

  it('drops the phone xterm CSI 997 that a theme write triggers', () => {
    const webview = loadThemedWebView()

    ;(webview.applyTerminalTheme as (input: unknown) => void)({ theme: { background: '#ffffff' } })

    expect(webview.forwarded).toEqual([])
  })

  it('forwards a color-scheme answer the program itself solicited', () => {
    const gate = loadGate()

    // Answer to the program's own `CSI ?996n`: no theme write is in flight, so it reaches the host.
    gate.forward(DARK_REPORT)

    expect(gate.forwarded).toEqual([{ type: 'terminal-data', bytes: DARK_REPORT }])
  })

  it('suppresses only the color-scheme report, never other replies, and only during the write', () => {
    const gate = loadGate()

    gate.withSuppressedWrite(() => {
      gate.forward(DARK_REPORT)
      gate.forward(CURSOR_POSITION_REPORT)
    })
    gate.forward(DARK_REPORT)

    expect(gate.forwarded).toEqual([
      { type: 'terminal-data', bytes: CURSOR_POSITION_REPORT },
      { type: 'terminal-data', bytes: DARK_REPORT }
    ])
  })

  it('unwinds the suppression depth when the theme write throws', () => {
    const gate = loadGate()

    expect(() =>
      gate.withSuppressedWrite(() => {
        throw new Error('theme write failed')
      })
    ).toThrow('theme write failed')
    gate.forward(DARK_REPORT)

    expect(gate.forwarded).toEqual([{ type: 'terminal-data', bytes: DARK_REPORT }])
  })
})
