"""T64: a check for updates always asks GitHub, and a failed one leaves a trace.

2026-11-09: 0.4.1 shipped while About still said "You're up to date" from a 15:19 answer
(0.4.0 then). The check itself must never answer from a cache: every `pal update check` (About's
button, the gear's Check for updates) asks GitHub with Cache-Control: no-cache, writes what it
found with the time, and logs a line. A check that fails keeps the last good answer but records
when it tried and why, so About can say "Couldn't check" instead of an old "up to date".

GitHub is never reached: a sitecustomize on PYTHONPATH swaps urllib's urlopen for a fake that
answers from FAKE_GITHUB (a JSON release, or "down") and logs each request's headers.
Run: python3 -m unittest tests.test_update_check
"""
import json
import os
import subprocess
import sys
import time
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import pals_tmp  # noqa: E402  (scratch folders removed at exit, T143)

BIN = Path(__file__).resolve().parent.parent / "bin"

FAKE = '''
import io, json, os, urllib.error, urllib.request
def _urlopen(req, timeout=None):
    with open(os.environ["FAKE_GITHUB_LOG"], "a") as f:
        f.write(json.dumps({"url": req.full_url, "headers": {k.lower(): v for k, v in req.header_items()}}) + "\\n")
    answer = os.environ.get("FAKE_GITHUB", "down")
    if answer == "down":
        raise urllib.error.URLError("Temporary failure in name resolution")
    if answer == "limited":
        raise urllib.error.HTTPError(req.full_url, 403, "rate limited", {}, None)
    class R(io.BytesIO):
        def __enter__(self): return self
        def __exit__(self, *a): return False
    return R(answer.encode())
urllib.request.urlopen = _urlopen
'''


def release(v):
    return json.dumps({"tag_name": f"v{v}", "name": f"Project Pals {v}", "body": "notes", "published_at": "2026-11-09T23:35:00Z",
                       "html_url": f"https://github.com/o/r/releases/tag/v{v}", "assets": [], "tarball_url": "t"})


class FreshCheck(unittest.TestCase):
    def setUp(self):
        self.t = Path(pals_tmp.mkdtemp(prefix="pals-update-"))
        self.home = self.t / "home"
        self.app = self.home / ".config" / "herdr-app"
        self.data = self.app / "data"
        self.data.mkdir(parents=True)
        (self.data / "crew-install.json").write_text(json.dumps({"repo": "o/r", "version": "0.4.0"}))
        site = self.t / "site"
        site.mkdir()
        (site / "sitecustomize.py").write_text(FAKE)
        self.log = self.t / "requests.jsonl"
        self.env = {**os.environ, "HOME": str(self.home), "HERDR_APP_HOME": str(self.app), "PYTHONPATH": str(site),
                    "FAKE_GITHUB_LOG": str(self.log), "PATH": f"{self.t}:/usr/bin:/bin"}
        for k in ("CREW_DATA", "HC_TERMINAL_ID", "HC_SCOPE"):
            self.env.pop(k, None)
        (self.t / "hc").write_text("#!/bin/sh\nexit 1\n")          # no Herdr: nothing reaches the live session
        (self.t / "hc").chmod(0o755)

    def check(self, answer):
        r = subprocess.run([sys.executable, str(BIN / "crew"), "update", "check", "--json"], capture_output=True, text=True,
                           env={**self.env, "FAKE_GITHUB": answer}, timeout=60)
        return r, json.loads((self.data / "crew-update.json").read_text()) if (self.data / "crew-update.json").exists() else {}

    def requests(self):
        return [json.loads(l) for l in self.log.read_text().splitlines()] if self.log.exists() else []

    def test_a_check_always_asks_github_even_right_after_one(self):
        # The cached answer is a minute old and says 0.4.0 is the newest; GitHub now says 0.4.1.
        (self.data / "crew-update.json").write_text(json.dumps({"checked": time.time() - 60, "repo": "o/r", "latest": "0.4.0"}))
        r, st = self.check(release("0.4.1"))
        self.assertEqual(r.returncode, 0, r.stderr)
        out = json.loads(r.stdout)
        self.assertTrue(out["available"])
        self.assertEqual(out["latest"], "0.4.1")
        self.assertEqual(st["latest"], "0.4.1")
        self.assertGreater(st["checked"], time.time() - 30)
        reqs = self.requests()
        self.assertEqual(len(reqs), 1, "one request per check, never served from our cache")
        self.assertTrue(reqs[0]["url"].endswith("/repos/o/r/releases/latest"))
        self.assertEqual(reqs[0]["headers"].get("cache-control"), "no-cache")
        # And again at once: a second request, not the answer just saved.
        self.check(release("0.4.1"))
        self.assertEqual(len(self.requests()), 2)

    def test_a_failed_check_keeps_the_answer_and_says_when_it_tried(self):
        old = time.time() - 3 * 3600
        (self.data / "crew-update.json").write_text(json.dumps({"checked": old, "repo": "o/r", "latest": "0.4.0", "notes": "n"}))
        r, st = self.check("down")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("couldn't reach GitHub", json.loads(r.stdout)["error"])
        self.assertEqual(st["latest"], "0.4.0")                 # the last good answer stays
        self.assertEqual(st["checked"], old)                    # and still reads as old
        self.assertGreater(st["tried"], old)
        self.assertIn("couldn't reach GitHub", st["error"])
        # A good check afterwards clears the failure.
        r, st = self.check(release("0.4.1"))
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertNotIn("error", st)
        self.assertNotIn("tried", st)

    def test_rate_limit_says_so(self):
        r, st = self.check("limited")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("403", st["error"])
        self.assertIn("try again later", st["error"])

    def test_every_check_is_logged(self):
        self.check(release("0.4.1"))
        self.check("down")
        lines = (self.data / "crew-update.log").read_text().splitlines()
        self.assertTrue(any("check by the app" in l and "newest is 0.4.1 (installed 0.4.0)" in l for l in lines), lines)
        self.assertTrue(any("check by the app" in l and "failed: couldn't reach GitHub" in l for l in lines), lines)


if __name__ == "__main__":
    unittest.main()
