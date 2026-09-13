#!/usr/bin/env python3
"""Install the ownership bridge into Orca 1.4.180 without restarting terminals.

Only the identified unpacked hook chunk and its ASAR metadata change. The
version/hash check refuses unknown releases. Live processes additionally load
hook-hub-ownership.cjs and call apply() on their cached hook controls module.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import struct
import tempfile

CHUNK = "out/main/chunks/managed-agent-hook-controls-CFGg5umy.js"
BASE_HASH = "dbd3ab57b7ce157ba28f4f3d892a306d6fe084aec934483de9c153e5d024b795"
LOADER = b'\n// 33god-hook-hub-ownership-v1\nrequire(require("node:path").join(__dirname, "../../../../hook-hub-ownership.cjs")).apply(exports);\n'


def unpack(data: bytes) -> tuple[dict, bytes]:
    marker, header_size, payload_size, json_size = struct.unpack("<4I", data[:16])
    if marker != 4 or header_size != payload_size + 4 or json_size > payload_size - 4:
        raise ValueError("Unsupported ASAR header")
    return json.loads(data[16:16 + json_size]), data[8 + header_size:]


def pack(header: dict, body: bytes) -> bytes:
    raw = json.dumps(header, separators=(",", ":"), ensure_ascii=False).encode()
    padding = b"\0" * (-(len(raw) + 4) % 4)
    size = 4 + len(raw) + len(padding)
    return struct.pack("<4I", 4, size + 4, size, len(raw)) + raw + padding + body


def entry(header: dict, name: str) -> dict:
    for part in name.split("/"):
        header = header["files"][part]
    return header


def atomic(path: Path, data: bytes, mode: int = 0o644) -> None:
    previous = path.stat() if path.exists() else None
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as f:
        temp = Path(f.name)
        try:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
            os.fchmod(f.fileno(), previous.st_mode & 0o777 if previous else mode)
            if previous and os.geteuid() == 0:
                os.fchown(f.fileno(), previous.st_uid, previous.st_gid)
        except BaseException:
            temp.unlink(missing_ok=True)
            raise
    try:
        temp.replace(path)
    finally:
        temp.unlink(missing_ok=True)


def install(app: Path, *, apply: bool = False) -> dict:
    resources = app / "resources"
    archive = resources / "app.asar"
    header, body = unpack(archive.read_bytes())
    package = entry(header, "package.json")
    start = int(package["offset"])
    version = json.loads(body[start:start + package["size"]])["version"]
    if version != "1.4.180":
        raise ValueError(f"Unsupported Orca release: {version}")
    metadata = entry(header, CHUNK)
    if metadata.get("unpacked") is not True:
        raise ValueError("Expected unpacked hook controls")
    chunk = resources / "app.asar.unpacked" / CHUNK
    current = chunk.read_bytes()
    base = current.removesuffix(LOADER)
    if hashlib.sha256(base).hexdigest() != BASE_HASH:
        raise ValueError("Installed hook controls differ from the verified 1.4.180 artifact")
    updated = base + LOADER
    digest = hashlib.sha256(updated).hexdigest()
    helper = Path(__file__).with_name("hook-hub-ownership.cjs").read_bytes()
    metadata["size"] = len(updated)
    block_size = metadata.get("integrity", {}).get("blockSize", 4 * 1024 * 1024)
    metadata["integrity"] = {"algorithm": "SHA256", "hash": digest, "blockSize": block_size,
                             "blocks": [hashlib.sha256(updated[i:i + block_size]).hexdigest()
                                        for i in range(0, len(updated), block_size)]}
    if apply:
        atomic(resources / "hook-hub-ownership.cjs", helper)
        atomic(chunk, updated)
        atomic(archive, pack(header, body))
    return {"version": version, "applied": apply, "already_patched": current == updated,
            "chunk": CHUNK, "chunk_sha256": digest,
            "helper_sha256": hashlib.sha256(helper).hexdigest()}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--app", type=Path, default=Path("/opt/Orca"))
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    print(json.dumps(install(args.app, apply=args.apply)))
