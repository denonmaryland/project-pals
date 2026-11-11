"""T155: useful diagnostics without leaking free-form data or reaching live services."""
import json
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "bin"))
import crewreport as report


class Report(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.base = Path(self.tmp.name)
        self.data = self.base / "data"
        self.data.mkdir()

    def tearDown(self):
        self.tmp.cleanup()

    def put(self, name, obj):
        (self.data / name).write_text(json.dumps(obj))

    def test_allowlist_with_private_inputs(self):
        secret = "PRIVATE-CANARY sk-test-secret /home/alice/private-project alice@example.test"
        self.put("crew-install.json", {"version": "0.4.1", "build": {"hash": "abcdef123456", "branch": secret},
                                      "source": secret, "repo": secret, "name": secret})
        self.put("crew-update-run.json", {"state": "failed", "error": secret})
        answers = {
            "herdr-app": "herdr-app 0.1.14 " + secret,
            "hc": "hc 0.1.19 " + secret,
            "systemctl": "LoadState=loaded\nActiveState=active\nSubState=running\nDescription=" + secret,
            "journalctl": "12:00:00 tick failed:\n" + secret + "\n12:00:01 couldn't deliver to " + secret,
        }
        with patch.object(report, "probe", side_effect=lambda args: answers[args[0]]), \
                patch.object(report, "distro", return_value="arch (release: unknown; rolling distros may have none)"), \
                patch.object(report.shutil, "which", side_effect=lambda cmd: "/home/alice/bin/" + cmd if cmd == "codex" else None):
            output = report.report(self.data)
        for item in ("0.4.1", "abcdef123456", "0.1.14", "0.1.19", "codex", "ActiveState=active",
                     "message delivery failed", "tick failed", "Last update run: failed"):
            self.assertIn(item, output)
        for item in ("PRIVATE-CANARY", "sk-test", "/home", "alice", "private-project"):
            self.assertNotIn(item, output)
        self.assertLess(output.index("- message delivery failed"), output.index("- tick failed"))
        self.assertTrue(output.startswith("```text\n"))

    def test_missing_and_malformed_inputs(self):
        for payload in (None, [], "private", {"version": ["private"], "build": [], "state": {"private": True}}):
            self.put("crew-install.json", payload)
            self.put("crew-update-run.json", payload)
            with patch.object(report, "probe", return_value=None), patch.object(report.shutil, "which", return_value=None):
                output = report.report(self.data)
            self.assertIn("Project Pals installed: unknown", output)
            self.assertIn("Herdr: unavailable", output)
            self.assertIn("journal unavailable", output)
            self.assertNotIn("private", output.lower().replace("private text", ""))
        (self.data / "crew-install.json").write_text("{broken")
        self.assertEqual(report.read_object(self.data / "crew-install.json"), {})

    def test_no_free_form_status_version_or_distro(self):
        with patch.object(report, "probe", return_value="LoadState=SECRET\nActiveState=/home/private\nSubState=secret"):
            self.assertEqual(report.service_state(), "LoadState=unknown, ActiveState=unknown, SubState=unknown")
        for value in ("sk-secret", "0.4.1/private", "1.2.3\nsecret", {}, None):
            self.assertEqual(report.version(value), "unknown")
        os_release = self.base / "os-release"
        os_release.write_text('ID="private-name"\nVERSION_ID="secret"\nPRETTY_NAME="private"\n')
        self.assertEqual(report.distro(os_release), "other/unknown (release: unknown; rolling distros may have none)")
        os_release.write_text('ID=fedora\nVERSION_ID="44"\n')
        self.assertIn("fedora (release: 44;", report.distro(os_release))
        for raw in ("private 0.1.14", "herdr-app 0.1.14/private", "bad\nherdr-app 0.1.14"):
            with patch.object(report, "probe", return_value=raw):
                self.assertEqual(report.program_version("herdr-app"), "unknown")

    def test_only_five_recognized_errors_newest_first(self):
        raw = "\n".join("12:00:00 " + x + ": private" for x in report.ERRORS)
        self.assertEqual(report.error_categories(raw), list(report.ERRORS[-5:][::-1]))
        self.assertEqual(report.error_categories("private text\nError: /home/private\n"), [])

    def test_reads_are_bounded_and_skip_links_and_fifos(self):
        target = self.base / "target"
        target.write_text("x" * (report.LIMIT + 1))
        self.assertIsNone(report.read_small(target))
        target.write_bytes(b"\xff")
        self.assertIsNone(report.read_small(target))
        target.write_text("secret")
        link = self.base / "link"
        link.symlink_to(target)
        self.assertIsNone(report.read_small(link))
        fifo = self.base / "fifo"
        os.mkfifo(fifo)
        self.assertIsNone(report.read_small(fifo))

    def test_probe_errors_and_timeout_do_not_escape(self):
        for error in (FileNotFoundError("private"), PermissionError("private"),
                      subprocess.TimeoutExpired(["private"], 3, output=b"secret")):
            with patch.object(report.subprocess, "run", side_effect=error):
                self.assertIsNone(report.probe(["missing"]))
        self.assertIsNone(report.probe([sys.executable, "-c", "import sys; sys.exit(1)"]))
        self.assertIsNone(report.probe([sys.executable, "-c", "print('x'*70000)"]))
        with patch.object(report, "TIMEOUT", 0.05):
            self.assertIsNone(report.probe([sys.executable, "-c", "import time; time.sleep(5)"]))

    def test_cli_before_install_uses_only_safe_probes_and_writes_no_data(self):
        shims = self.base / "shims"
        shims.mkdir()
        log = self.base / "calls"
        for cmd, output in (("herdr-app", "herdr-app 0.1.14"), ("hc", "hc 0.1.19"),
                            ("systemctl", "LoadState=not-found\nActiveState=inactive\nSubState=dead"),
                            ("journalctl", "12:00:00 review failed:\nPRIVATE-CANARY")):
            shim = shims / cmd
            shim.write_text('#!/bin/sh\nprintf "%s\\n" "$0 $*" >> "$CALL_LOG"\nprintf "%s\\n" ' + shlex.quote(output) + '\n')
            shim.chmod(0o755)
        for cmd in ("claude", "git"):
            shim = shims / cmd
            shim.write_text('#!/bin/sh\necho UNEXPECTED >> "$CALL_LOG"\nexit 1\n')
            shim.chmod(0o755)
        env = {"HOME": str(self.base / "nonexistent-home"), "CREW_DATA": str(self.base / "missing-data"),
               "PATH": str(shims), "CALL_LOG": str(log)}
        result = subprocess.run([sys.executable, str(ROOT / "bin/crew"), "report"], env=env,
                                capture_output=True, text=True, timeout=20)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stderr, "")
        self.assertIn("Project Pals installed: unknown", result.stdout)
        self.assertIn("Herdr: 0.1.14", result.stdout)
        self.assertIn("LoadState=not-found", result.stdout)
        self.assertNotIn("PRIVATE-CANARY", result.stdout)
        self.assertFalse((self.base / "missing-data").exists())
        self.assertFalse((self.base / "nonexistent-home").exists())
        calls = log.read_text().splitlines()
        self.assertEqual(len(calls), 4, calls)
        self.assertTrue(calls[0].endswith("herdr-app --version"))
        self.assertTrue(calls[1].endswith("hc --version"))
        for arg in ("--help", "--upload"):
            result = subprocess.run([sys.executable, str(ROOT / "bin/crew"), "report", arg], env=env,
                                    capture_output=True, text=True, timeout=10)
            self.assertEqual(result.returncode, 0 if arg == "--help" else 2)
        self.assertEqual(log.read_text().splitlines(), calls)

        # The installed command and modules live in different directories; the legacy
        # crew alias must resolve to the same reporting path without importing crewlib.
        home = self.base / "installed-home"
        bindir = home / ".local/bin"
        libdir = home / ".local/lib/herdr-crew"
        bindir.mkdir(parents=True)
        libdir.mkdir(parents=True)
        shutil.copyfile(ROOT / "bin/crew", bindir / "pal")
        shutil.copyfile(ROOT / "bin/crewreport.py", libdir / "crewreport.py")
        (bindir / "crew").symlink_to("pal")
        for command in ("pal", "crew"):
            result = subprocess.run([sys.executable, str(bindir / command), "report"],
                                    env={**env, "HOME": str(home)}, capture_output=True, text=True, timeout=20)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("Herdr: 0.1.14", result.stdout)
        self.assertFalse((libdir / "__pycache__").exists())


if __name__ == "__main__":
    unittest.main()
