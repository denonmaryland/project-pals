"""Local diagnostics with an output allowlist, not a best-effort scrub of private text.

No crewlib import: it loads owner/settings. No harness execution, terminal reads, network,
settings, environment dump or raw log output. Missing probes never prevent the rest of a report.
"""
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import tempfile

LIMIT = 64 * 1024
TIMEOUT = 3
HARNESS_COMMANDS = ("claude", "agy", "codex", "grok", "gemini", "opencode", "hermes",
                    "copilot", "cursor-agent", "agent", "pi", "amp", "kimi", "crush")
DISTROS = frozenset(("arch", "omarchy", "ubuntu", "debian", "fedora", "linuxmint", "pop", "nixos",
                    "manjaro", "endeavouros", "cachyos", "opensuse-tumbleweed", "opensuse-leap",
                    "gentoo", "alpine", "rhel", "centos", "rocky", "almalinux", "void"))
ERRORS = ("tick failed", "approval tidy failed", "update check failed", "desk triage failed",
          "desk upkeep failed", "review failed", "dream failed")


def read_small(path):
    """No devices, FIFOs, final-component symlinks, oversized or invalid UTF-8 files."""
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NONBLOCK | os.O_NOFOLLOW)
        with os.fdopen(fd, "rb") as f:
            if not stat.S_ISREG(os.fstat(f.fileno()).st_mode):
                return None
            raw = f.read(LIMIT + 1)
        return raw.decode("utf-8") if len(raw) <= LIMIT else None
    except (OSError, UnicodeError):
        return None


def read_object(path):
    try:
        value = json.loads(read_small(path) or "null")
        return value if isinstance(value, dict) else {}
    except (ValueError, RecursionError):
        return {}


def probe(argv):
    # A file avoids unbounded in-memory capture; fixed probes and a timeout bound each call.
    # stderr (which can contain paths or credentials) is never consumed or printed.
    try:
        with tempfile.TemporaryFile() as out:
            result = subprocess.run(argv, stdin=subprocess.DEVNULL, stdout=out,
                                    stderr=subprocess.DEVNULL, timeout=TIMEOUT,
                                    env={**os.environ, "LC_ALL": "C", "SYSTEMD_COLORS": "0"})
            out.seek(0)
            raw = out.read(LIMIT + 1)
        if result.returncode or len(raw) > LIMIT:
            return None
        return raw.decode("utf-8")
    except (OSError, UnicodeError, subprocess.TimeoutExpired):
        return None


def version(value):
    # Do not print arbitrary suffixes (local build names can be private).
    if isinstance(value, str) and re.fullmatch(r"[0-9]{1,4}(?:\.[0-9]{1,4}){1,3}", value):
        return value
    return "unknown"


def program_version(program):
    raw = probe([program, "--version"])
    if raw is None:
        return "unavailable"
    match = re.match(r"(?:" + re.escape(program) + r"\s+)?v?([0-9]{1,4}(?:\.[0-9]{1,4}){1,3})(?=\s|$)", raw)
    return version(match[1]) if match else "unknown"


def distro(path=Path("/etc/os-release")):
    # os-release is often a system symlink; only this fixed system source may follow one.
    try:
        raw = read_small(path.resolve()) or ""
    except (OSError, RuntimeError):
        raw = ""
    fields = {}
    for line in raw.splitlines():
        key, sep, value = line.partition("=")
        if sep and key in ("ID", "VERSION_ID"):
            fields[key] = value.strip().strip("\"'")
    name = fields.get("ID")
    name = name if name in DISTROS else "other/unknown"
    release = version(fields.get("VERSION_ID"))
    # Single-number distro releases (Fedora) are valid too.
    if re.fullmatch(r"[0-9]{1,4}", fields.get("VERSION_ID", "")):
        release = fields["VERSION_ID"]
    return f"{name} (release: {release}; rolling distros may have none)"


def service_state():
    raw = probe(["systemctl", "--user", "show", "herdr-crew.service", "--no-pager",
                 "--property=LoadState", "--property=ActiveState", "--property=SubState"])
    if raw is None:
        return "unavailable (no user systemd session, missing command or timed out)"
    allowed = {"LoadState": {"loaded", "not-found", "masked", "error", "bad-setting", "merged", "stub"},
               "ActiveState": {"active", "inactive", "failed", "activating", "deactivating", "reloading", "maintenance"},
               "SubState": {"running", "dead", "failed", "exited", "start", "stop", "auto-restart"}}
    fields = dict(line.split("=", 1) for line in raw.splitlines() if "=" in line)
    return ", ".join(f"{key}={fields.get(key) if fields.get(key) in values else 'unknown'}"
                     for key, values in allowed.items())


def error_categories(raw):
    """Translate recognized daemon lines into constants; never copy any part of a message."""
    found = []
    for line in raw.splitlines():
        msg = re.sub(r"^[0-9]{2}:[0-9]{2}:[0-9]{2} ", "", line)
        category = next((x for x in ERRORS if msg == x or msg.startswith(x + ":")), None)
        if category is None and msg.startswith("couldn't deliver to "):
            category = "message delivery failed"
        if category is None and msg.startswith("desk upkeep:"):
            category = "desk upkeep failed"
        if category:
            found.append(category)
    return found[-5:][::-1]


def report(data=None):
    if data is None:
        home = Path(os.environ.get("HERDR_APP_HOME", Path.home() / ".config/herdr-app"))
        data = Path(os.environ.get("CREW_DATA") or home / "data")
    installed = read_object(data / "crew-install.json")
    build = installed.get("build")
    commit = build.get("hash") if isinstance(build, dict) else None
    commit = commit if isinstance(commit, str) and re.fullmatch(r"[0-9a-f]{7,40}", commit) else "unknown"
    found = [cmd for cmd in HARNESS_COMMANDS if shutil.which(cmd)]
    lines = ["Project Pals diagnostic (report format 1)",
             f"Project Pals installed: {version(installed.get('version'))}", f"Installed build: {commit}",
             f"Herdr: {program_version('herdr-app')}", f"herdr-core (hc): {program_version('hc')}",
             f"Linux distro: {distro()}",
             "Harness commands on PATH (presence only, not login or compatibility): " + (", ".join(found) or "none found"),
             "crewd: " + service_state()]
    journal = probe(["journalctl", "--user", "--unit=herdr-crew.service", "--lines=100",
                     "--no-pager", "--output=cat"])
    lines.append("Recent recognized crewd errors (newest first; last 100 journal lines, at most 5):")
    if journal is None:
        lines.append("- journal unavailable (missing, unreadable, too large or timed out)")
    else:
        errors = error_categories(journal)
        lines.extend("- " + item for item in errors)
        if not errors:
            lines.append("- none recognized in available journal lines (not proof of no errors)")
    update = read_object(data / "crew-update-run.json")
    lines.append("Last update run: " + (update.get("state") if update.get("state") in
                 ("running", "done", "failed") else "unknown"))
    lines += ["Raw errors, paths, names, prompts, transcripts, settings and credentials are omitted.",
              "Nothing uploaded. Review this report and any text/screenshots you add before posting."]
    return "```text\n" + "\n".join(lines) + "\n```"


def main(argv):
    if argv in (["--help"], ["-h"]):
        print("Usage: pal report\nPrint local, paste-ready diagnostics. No upload; raw log messages are omitted.")
        return 0
    if argv:
        print("Usage: pal report (no options)")
        return 2
    print(report())
    return 0
