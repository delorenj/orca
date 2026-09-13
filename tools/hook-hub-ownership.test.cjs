"use strict";
const assert = require("node:assert/strict");
const {test} = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {pathToFileURL} = require("node:url");
const {execFileSync} = require("node:child_process");
const overlay = require("./hook-hub-ownership.cjs");

test("ownership wraps only named CLIs, mirrors Codex, and is idempotent", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "orca-owner-"));
  const old = process.env.BB_HOOK_OWNERSHIP;
  const bypass = process.env.BB_HOOK_HUB;
  try {
    process.env.BB_HOOK_OWNERSHIP = path.join(dir, "owner.json");
    delete process.env.BB_HOOK_HUB;
    fs.writeFileSync(process.env.BB_HOOK_OWNERSHIP, JSON.stringify({version: 1, handler_ids: ["orca-status"], clis: ["codex"]}));
    let installed = 0, refreshed = 0, remote = 0;
    const service = {install() {installed++;}, getStatus() {return "native";},
      refreshRuntimeUserHooks(home) {assert.equal(home, "test-home"); refreshed++;},
      installRemote() {remote++;}};
    const controls = {codexHookService: service};
    const first = overlay.apply(controls);
    assert.equal(overlay.apply(controls), first);
    assert.equal(service.install("test-home").state, "skipped");
    assert.equal(installed, 0);
    assert.equal(refreshed, 1);
    assert.equal(service.getStatus().managedHooksPresent, false);
    const sftp = {readFile(_path, _encoding, cb) {cb(null, JSON.stringify({version: 1, handler_ids: ["orca-status"], clis: ["codex"]}));}};
    assert.equal((await service.installRemote(sftp, "/remote")).state, "skipped");
    assert.equal(remote, 0);
    process.env.BB_HOOK_HUB = "off";
    service.install();
    assert.equal(installed, 1);
  } finally {
    if (old === undefined) delete process.env.BB_HOOK_OWNERSHIP; else process.env.BB_HOOK_OWNERSHIP = old;
    if (bypass === undefined) delete process.env.BB_HOOK_HUB; else process.env.BB_HOOK_HUB = bypass;
    fs.rmSync(dir, {recursive: true, force: true});
  }
});

test("generated OpenCode plugin checks cutover per post and permits supervised child", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "orca-plugin-owner-"));
  const old = process.env.BB_HOOK_OWNERSHIP;
  const bypass = process.env.BB_HOOK_HUB;
  try {
    process.env.BB_HOOK_OWNERSHIP = path.join(dir, "owner.json");
    delete process.env.BB_HOOK_HUB;
    const source = 'let calls=0; async function post(hookEventName, extraProperties) { calls++; return false; } export {post}; export const count=()=>calls;';
    const guarded = overlay.guardOpenCode(source);
    assert.equal(overlay.guardOpenCode(guarded), guarded);
    const plugin = path.join(dir, "plugin.mjs");
    fs.writeFileSync(plugin, guarded);
    const module = await import(pathToFileURL(plugin).href);
    await module.post();
    assert.equal(module.count(), 1);
    fs.writeFileSync(process.env.BB_HOOK_OWNERSHIP, JSON.stringify({version: 1, handler_ids: ["orca-status"], clis: ["opencode"]}));
    assert.equal(await module.post(), true);
    assert.equal(module.count(), 1);
    process.env.BB_HOOK_HUB = "off";
    await module.post();
    assert.equal(module.count(), 2);
  } finally {
    if (old === undefined) delete process.env.BB_HOOK_OWNERSHIP; else process.env.BB_HOOK_OWNERSHIP = old;
    if (bypass === undefined) delete process.env.BB_HOOK_HUB; else process.env.BB_HOOK_HUB = bypass;
    fs.rmSync(dir, {recursive: true, force: true});
  }
});

test("plugin writer leaves unrelated files unchanged and produces valid Python", () => {
  assert.equal(overlay.guardedPlugin("/tmp/unrelated.js", "data"), "data");
  const source = 'from typing import Any\nimport os\ndef _make_hook(event_name):\n    def _hook(**kwargs: Any) -> None:\n        print(event_name)\n    return _hook\n';
  const guarded = overlay.guardHermes(source);
  assert.equal(overlay.guardHermes(guarded), guarded);
  execFileSync("python3", ["-c", "import sys; compile(sys.stdin.read(), 'plugin.py', 'exec')"], {input: guarded});
  assert.throws(() => overlay.guardOpenCode("changed generator"), /anchor changed/);
});
