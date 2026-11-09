#!/usr/bin/env python3
"""Which Herdr this Project Pals works with (pals.json "herdr"), and whether the installed one is in it.

  crewcompat.py PALS_JSON [--json]    check the herdr-app and hc on PATH; prints a warning when either
                                      is outside the range (exit 0 either way: it warns, never blocks)

Herdr is at 0.1.x, so a Herdr update can change what Project Pals relies on (app commands and their
arguments, the mod API, `hc ls/get/read/send/label --json`) without notice. The range is what was
actually tried: `min` is the oldest version a release was tested on, `tested` the newest, and `below`
the first version that isn't supported at all (Herdr's next generation). A version newer than
`tested` but below `below` is likely fine and gets a quiet note; outside min..below gets a warning.

Standard library only: install.sh runs it from the checkout before anything is installed.
"""
import json
import re
import subprocess
import sys

PROGRAMS = {"app": ("herdr-app", "Herdr"), "core": ("hc", "herdr-core (hc)")}


def vtuple(v):
    """'0.1.14' → (0, 1, 14); anything unparseable → None."""
    m = re.search(r"(\d+)\.(\d+)(?:\.(\d+))?", str(v or ""))
    return (int(m.group(1)), int(m.group(2)), int(m.group(3) or 0)) if m else None


def installed_version(program):
    """`herdr-app --version` says 'herdr-app 0.1.14', `hc --version` 'hc 0.1.19'. None if missing."""
    try:
        r = subprocess.run([program, "--version"], capture_output=True, text=True, timeout=10)
    except (OSError, subprocess.TimeoutExpired):
        return None
    t = vtuple(r.stdout) if r.returncode == 0 else None
    return ".".join(map(str, t)) if t else None


def judge(kind, version, rng):
    """One program against its range: {kind, name, version, status, message}.
    status: ok | newer (past what was tested, below the next generation) | old | unsupported | missing | unknown."""
    name = PROGRAMS[kind][1]
    lo, tested, below = (rng or {}).get("min"), (rng or {}).get("tested"), (rng or {}).get("below")
    span = f"{lo} or newer, below {below}" if lo and below else (f"{lo} or newer" if lo else "any")
    out = {"kind": kind, "name": name, "version": version, "min": lo, "tested": tested, "below": below}
    v = vtuple(version)
    if not rng:
        return {**out, "status": "unknown", "message": f"{name}: no supported range in pals.json"}
    if version is None:
        return {**out, "status": "missing", "message": f"{name} isn't installed (or doesn't say its version); Project Pals needs {span}"}
    if v is None:
        return {**out, "status": "unknown", "message": f"{name} says its version is {version!r}; can't tell if it's supported ({span})"}
    if lo and v < vtuple(lo):
        return {**out, "status": "old", "message": f"{name} {version} is older than Project Pals supports ({span}). Update Herdr first."}
    if below and v >= vtuple(below):
        return {**out, "status": "unsupported", "message": f"{name} {version} is newer than Project Pals supports ({span}). "
                                                           f"Look for a Project Pals update (About → Check for updates); until then things may break."}
    if tested and v > vtuple(tested):
        return {**out, "status": "newer", "message": f"{name} {version} is newer than Project Pals was tested on ({tested}); it should work"}
    return {**out, "status": "ok", "message": f"{name} {version}: supported"}


def check(manifest, versions=None):
    """{ok, warn: [messages], notes: [messages], programs: [judge(...)]} for pals.json's "herdr" range.
    versions: {"app": "0.1.14", "core": "0.1.19"} to judge given versions instead of asking PATH."""
    rng = (manifest or {}).get("herdr") or {}
    progs = []
    for kind, (program, _name) in PROGRAMS.items():
        v = (versions or {}).get(kind) if versions is not None else installed_version(program)
        progs.append(judge(kind, v, rng.get(kind)))
    warn = [p["message"] for p in progs if p["status"] in ("old", "unsupported", "missing", "unknown")]
    notes = [p["message"] for p in progs if p["status"] == "newer"]
    return {"ok": not warn, "warn": warn, "notes": notes, "programs": progs}


def supported_line(manifest):
    """'Herdr 0.1.8 or newer and herdr-core 0.1.11 or newer, both below 0.2 (tested up to 0.1.14 / 0.1.19)'."""
    r = (manifest or {}).get("herdr") or {}
    a, c = r.get("app") or {}, r.get("core") or {}
    return (f"Herdr {a.get('min')}+ and herdr-core {c.get('min')}+, below {a.get('below')} "
            f"(tested up to {a.get('tested')} / {c.get('tested')})")


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__.strip())
        return 0
    manifest = json.load(open(argv[0]))
    res = check(manifest)
    if "--json" in argv:
        print(json.dumps(res))
        return 0
    if res["warn"]:
        bar = "!" * 72
        print(bar, file=sys.stderr)
        print("WARNING: this Herdr isn't one Project Pals supports.", file=sys.stderr)
        for m in res["warn"]:
            print(f"  - {m}", file=sys.stderr)
        print(f"  Supported: {supported_line(manifest)}.", file=sys.stderr)
        print("  Installing anyway; if something misbehaves, this is the likely reason.", file=sys.stderr)
        print(bar, file=sys.stderr)
    for m in res["notes"]:
        print(f"note: {m}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
