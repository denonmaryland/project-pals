"""Profiles-only findings of the Codex review: H5 (dream approval bound to the shown text), H6 (private
keys), M1 (notebook path containment), M2 (concurrent notebook writers), M3 (exact entry removal),
M7 (dream housekeeping on quiet nights). Throwaway CREW_DATA and HOME; nothing real is touched."""
import json
import multiprocessing
import os
import sys
import tempfile
import unittest
from pathlib import Path

TMP = tempfile.mkdtemp(prefix="pals-prof-")
os.environ["CREW_DATA"] = TMP
os.environ["HERDR_APP_HOME"] = TMP
os.environ["HOME"] = TMP
os.environ.pop("HC_TERMINAL_ID", None)
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "bin"))

import crewnotebook as nb   # noqa: E402
import crewdream as dm      # noqa: E402
import crewproposals as cp  # noqa: E402
from crewlib import CrewError, now_ms   # noqa: E402

FAKE_KEY = "-----BEGIN OPENSSH PRIVATE KEY-----\nAAAAfakefakefakefakefakefake\n-----END OPENSSH PRIVATE KEY-----"


class PrivateKeys(unittest.TestCase):          # H6
    def test_multiline_block_refused(self):
        with self.assertRaises(CrewError):
            nb.add("Key Pal", did="x", hiccups=[FAKE_KEY])

    def test_flattened_block_refused(self):
        with self.assertRaises(CrewError):
            nb.add("Key Pal", did="x", hiccups=[" ".join(FAKE_KEY.split())])

    def test_pem_rsa_refused(self):
        with self.assertRaises(CrewError):
            nb.add("Key Pal", did="x", lesson="-----BEGIN RSA PRIVATE KEY----- MIIfake -----END RSA PRIVATE KEY-----")

    def test_intake_refuses_keys(self):
        dm.save_patterns({"P-1": {"id": "P-1", "summary": "s", "status": "open", "count": 1, "pals": [], "minutes": 0, "sources": []}})
        with self.assertRaises(CrewError):
            dm.intake("P-1", "what happened\n" + FAKE_KEY)
        p = dm.intake("P-1", "what happened, nothing secret")
        self.assertTrue(p.exists())


class Paths(unittest.TestCase):                # M1
    def setUp(self):
        self.home = Path(TMP)
        self.proj = self.home / "Projects" / "demo"
        self.proj.mkdir(parents=True, exist_ok=True)
        (self.home / "Documents").mkdir(exist_ok=True)

    def test_prefix_sibling_refused(self):
        with self.assertRaises(CrewError):
            nb.clean(f"read {self.home}/Elsewhere/demo-private/customer.txt", project=self.proj)

    def test_traversal_refused(self):
        with self.assertRaises(CrewError):
            nb.clean(f"opened {self.proj}/../../Documents/private.txt", project=self.proj)

    def test_symlink_escape_refused(self):
        link = self.proj / "docs-link"
        if not link.exists():
            link.symlink_to(self.home / "Documents")
        with self.assertRaises(CrewError):
            nb.clean(f"read {link}/private.txt", project=self.proj)

    def test_project_and_config_allowed(self):
        self.assertIn("RECIPE.md", nb.clean(f"edited {self.proj}/RECIPE.md", project=self.proj))
        self.assertIn("keys.json", nb.clean("~/.config/herdr-app/keys.json was missing", project=self.proj))


def _writer(n, barrier):
    barrier.wait()
    nb.add("Busy Pal", did=f"entry from writer {n}", channel=f"ch{n}")


class Concurrency(unittest.TestCase):          # M2
    def test_no_lost_entries(self):
        ctx = multiprocessing.get_context("fork")
        barrier = ctx.Barrier(4)
        ps = [ctx.Process(target=_writer, args=(i, barrier)) for i in range(4)]
        for p in ps:
            p.start()
        for p in ps:
            p.join()
            self.assertEqual(p.exitcode, 0)
        text = nb.day_path("Busy Pal").read_text()
        for i in range(4):
            self.assertIn(f"entry from writer {i}", text)
        self.assertFalse([f for f in nb.folder("Busy Pal").iterdir() if f.name.endswith(".tmp")])


class ExactRemoval(unittest.TestCase):         # M3
    def test_same_minute_other_channel_kept(self):
        a = nb.add("Rm Pal", did="first", channel="a")
        b = nb.add("Rm Pal", did="second", channel="b")
        self.assertNotEqual(a["id"], b["id"])
        day = nb.day_path("Rm Pal").stem
        nb.remove("Rm Pal", day, a["id"], Path(TMP) / "bk")
        text = nb.day_path("Rm Pal").read_text()
        self.assertNotIn("first", text)
        self.assertIn("second", text)

    def test_ambiguous_legacy_refused(self):
        p = nb.day_path("Old Pal")
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text("# Old Pal\n\n### 12:00 · #x\n- did: one\n\n### 12:00 · #x\n- did: two\n")
        with self.assertRaises(CrewError):
            nb.remove("Old Pal", p.stem, "12:00 #x", Path(TMP) / "bk")
        self.assertIn("one", p.read_text())


class DreamHousekeeping(unittest.TestCase):    # M7
    def test_quiet_night_resolves_and_reopens(self):
        dm.save_patterns({
            "P-7": {"id": "P-7", "summary": "watched", "status": "watching", "accepted_at": now_ms() - 15 * 86400000,
                    "count": 3, "pals": ["A"], "minutes": 30, "sources": []},
            "P-8": {"id": "P-8", "summary": "proposed", "status": "proposed", "proposal": "p-gone",
                    "count": 3, "pals": ["A"], "minutes": 30, "sources": []}})
        out = dm.dream(model=False)
        self.assertTrue(out.get("skipped"))
        self.assertEqual(dm.patterns()["P-7"]["status"], "resolved")
        self.assertEqual(dm.patterns()["P-8"]["status"], "open")


class ReviewedText(unittest.TestCase):         # H5
    def test_accept_needs_the_shown_text(self):
        p = cp.propose("dream", "crew", "Orca", "# A skill\nthe text", None, None, "why", {"pattern": "P-1", "kind": "skill", "name": "x"})
        full = cp.get(p["id"])
        with self.assertRaises(CrewError):
            cp.check_reviewed(full, None)                      # never shown: refused
        with self.assertRaises(CrewError):
            cp.check_reviewed(full, "0" * 64)                  # another text: refused
        cp.check_reviewed(full, cp.text_sha(full))             # the shown one: fine
        (cp.DIR / f"{p['id']}.md").write_text("# swapped\nsomething else")
        with self.assertRaises(CrewError):
            cp.check_reviewed(cp.get(p["id"]), cp.text_sha(full))   # changed after it was shown


if __name__ == "__main__":
    unittest.main()
