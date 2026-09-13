"use strict";

// Versioned bridge for an installed Orca whose terminals must stay alive during
// hook cutover. New source uses external-hook-ownership.ts directly.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const MARKER = Symbol.for("33god.orca.hook-hub-ownership.v1");
const VERSION = 1;
const SERVICES = {
  claude: "claudeHookService",
  codex: "codexHookService",
  copilot: "copilotHookService",
  gemini: "geminiHookService",
  hermes: "hermesHookService",
  kimi: "kimiHookService",
  antigravity: "antigravityHookService",
};

function manifestPath() {
  return process.env.BB_HOOK_OWNERSHIP || path.join(os.homedir(), ".config/33god/hook-hub/ownership.json");
}

function ownsContent(content, cli) {
  try {
    const owner = JSON.parse(content);
    return owner.version === 1 && owner.handler_ids?.includes("orca-status") && owner.clis?.includes(cli);
  } catch {
    return false;
  }
}

function owns(cli) {
  if (process.env.BB_HOOK_HUB === "off") return false;
  try {
    return ownsContent(fs.readFileSync(manifestPath(), "utf8"), cli);
  } catch {
    return false;
  }
}

function skipped(cli, source = manifestPath()) {
  return {agent: cli, state: "skipped", skipReason: "hooks_disabled", configPath: source,
    managedHooksPresent: false, detail: "Hook hub owns Orca status for this CLI."};
}

const OPEN_CODE_GUARD = [
  'import { readFileSync as readHookOwnership } from "node:fs";',
  'import { homedir as hookOwnershipHome } from "node:os";',
  'import { join as hookOwnershipJoin } from "node:path";',
  'function hookHubOwnsStatus() {',
  '  if (process.env.BB_HOOK_HUB === "off") return false;',
  '  try {',
  '    const path = process.env.BB_HOOK_OWNERSHIP || hookOwnershipJoin(hookOwnershipHome(), ".config/33god/hook-hub/ownership.json");',
  '    const owner = JSON.parse(readHookOwnership(path, "utf8"));',
  '    return owner.version === 1 && owner.handler_ids?.includes("orca-status") && owner.clis?.includes("opencode");',
  '  } catch { return false; }',
  '}',
  '',
].join("\n");

function guardOpenCode(source) {
  if (source.includes("function hookHubOwnsStatus()")) return source;
  const needle = "async function post(hookEventName, extraProperties) {";
  if (source.split(needle).length !== 2) throw new Error("OpenCode ownership patch anchor changed");
  return OPEN_CODE_GUARD + source.replace(needle, needle + "\n  if (hookHubOwnsStatus()) return true;");
}

function guardHermes(source) {
  if (source.includes("def _hook_hub_owns_status()")) return source;
  const needle = "    def _hook(**kwargs: Any) -> None:\n";
  if (source.split(needle).length !== 2) throw new Error("Hermes ownership patch anchor changed");
  const guard = [
    '', 'def _hook_hub_owns_status() -> bool:',
    '    if os.environ.get("BB_HOOK_HUB") == "off":', '        return False',
    '    try:', '        from pathlib import Path', '        import importlib.util',
    '        checker = Path.home() / ".agents/hooks/hub/ownership.py"',
    '        spec = importlib.util.spec_from_file_location("orca_hook_ownership", checker)',
    '        if spec is None or spec.loader is None:', '            return False',
    '        module = importlib.util.module_from_spec(spec)', '        spec.loader.exec_module(module)',
    '        return module.owns("orca-status", "hermes")',
    '    except Exception:', '        return False', '',
  ].join("\n");
  return source.replace(needle, needle + "        if _hook_hub_owns_status():\n            return\n") + guard;
}

function guardedPlugin(filename, data) {
  const name = String(filename).replaceAll("\\", "/");
  if (typeof data !== "string" && !Buffer.isBuffer(data)) return data;
  if (name.endsWith("/orca-opencode-status.js")) return guardOpenCode(String(data));
  if (name.endsWith("/plugins/orca-status/__init__.py")) return guardHermes(String(data));
  return data;
}

function apply(controls) {
  if (controls[MARKER]) return controls[MARKER];
  const wrapped = [];
  for (const [cli, key] of Object.entries(SERVICES)) {
    const service = controls[key];
    if (!service) continue;
    const originalInstall = service.install;
    const originalStatus = service.getStatus;
    service.install = function (...args) {
      if (!owns(cli)) return originalInstall.apply(this, args);
      if (cli === "codex") {
        const result = this.refreshRuntimeUserHooks(...args);
        if (result?.state === "error") return result;
      }
      return skipped(cli);
    };
    service.getStatus = function (...args) {
      return owns(cli) ? skipped(cli) : originalStatus.apply(this, args);
    };
    if (typeof service.installRemote === "function") {
      const originalRemote = service.installRemote;
      service.installRemote = async function (sftp, home, ...rest) {
        const remote = path.posix.join(home, ".config/33god/hook-hub/ownership.json");
        const content = await new Promise(resolve => {
          sftp.readFile(remote, "utf8", (error, data) => resolve(error ? "" : String(data)));
        });
        if (ownsContent(content, cli)) return skipped(cli, remote);
        return originalRemote.call(this, sftp, home, ...rest);
      };
    }
    wrapped.push(cli);
  }
  // OpenCode's overlay generator is bundled in the main module rather than
  // the exported controls. Preserve its overlay while guarding the exact two
  // generated plugin filenames before they reach disk.
  if (!fs.writeFileSync[MARKER]) {
    const write = fs.writeFileSync;
    const wrappedWrite = function (filename, data, ...rest) {
      return write.call(this, filename, guardedPlugin(filename, data), ...rest);
    };
    wrappedWrite[MARKER] = true;
    fs.writeFileSync = wrappedWrite;
    require("node:module").syncBuiltinESMExports();
  }
  const report = {version: VERSION, pid: process.pid, wrapped, pluginWriterGuard: true};
  Object.defineProperty(controls, MARKER, {value: report});
  return report;
}

module.exports = {apply, owns, ownsContent, guardOpenCode, guardHermes, guardedPlugin};
