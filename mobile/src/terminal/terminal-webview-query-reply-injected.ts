// Kept as one injectable unit so tests execute the same replay/generation gate
// that the WebView document runs, rather than a TypeScript reimplementation.
export const TERMINAL_QUERY_REPLY_JS = `
  var terminalDataRepliesEnabled = false;

  function resetTerminalDataReplyAuthority() {
    terminalDataRepliesEnabled = false;
  }

  function resumeTerminalDataReplyAuthority() {
    terminalDataRepliesEnabled = true;
  }

  function forwardTerminalDataReply(data) {
    if (!terminalDataRepliesEnabled) return;
    // Why: a phone theme write would otherwise send the host a second CSI 997 on top of the
    // desktop's own flip push, and describe the phone's theme rather than the host's (#9993).
    if (isSuppressedXtermColorSchemePush(data)) return;
    notify({ type: 'terminal-data', bytes: data });
  }

  function enqueueTerminalDataReplyBoundary(gen) {
    enqueueWriteBoundary(function() {
      if (gen === terminalGeneration) terminalDataRepliesEnabled = true;
    });
  }

  function attachTerminalQueryReplyBridge(term, gen) {
    // Why: parser replies require stdin enabled, but mobile input is owned by
    // native controls. Keep xterm's textarea inert for touch/hardware keys.
    try {
      term.attachCustomKeyEventHandler(function() { return false; });
      if (term.textarea) {
        term.textarea.readOnly = true;
        term.textarea.tabIndex = -1;
        term.textarea.setAttribute('inputmode', 'none');
      }
    } catch (e) {}
    try {
      termObserverDisposables.push(term.onData(function(data) {
        forwardTerminalDataReply(data);
      }));
    } catch (e) {}
    // Why: live output can queue before initial replay finishes. Enable replies
    // at the replay boundary so those live queries are answered, never replayed ones.
    enqueueTerminalDataReplyBoundary(gen);
  }
`
