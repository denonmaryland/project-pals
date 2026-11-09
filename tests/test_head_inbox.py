"""T60: the head pal's inbox topic. With head_topic set (an owner setting), everything pushed to the
head pal without a #topic lands there: pal tell / task notices to "Orca", its tray cards, the Desk
check-in, dream digests and crewd's alerts. "Orca#general" still reaches #general. Unset, nothing
changes. Throwaway HOME, data and fake hc / herdr-app, like test_desk.
Run: python3 -m unittest tests.test_head_inbox"""
import json
import sys
import tempfile
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_desk import pal, py, owner, click, OWNER  # noqa: E402


def sandbox(ops_live=True, with_ops=True):
    """Orca (the head pal: #general tG, shown; #ops tO) and Worker (#general tW)."""
    root = Path(tempfile.mkdtemp(prefix="pals-head-"))
    home, data, shims, app = root / "home", root / "data", root / "shims", root / "app"
    for d in (home, data, shims, app):
        d.mkdir(parents=True)
    orca_tabs = [{"id": "tb0", "name": "#general", "active": True, "terminals": [{"terminal": "tG", "app": "claude-code"}]}]
    if with_ops:
        orca_tabs.append({"id": "tb1", "name": "#ops", "terminals": [{"terminal": "tO", **({"app": "claude-code"} if ops_live else {})}]})
    spaces = {"spaces": [{"id": "s0", "name": "Orca", "tabs": orca_tabs},
                         {"id": "s1", "name": "Worker", "tabs": [{"id": "tb2", "name": "#general", "active": True,
                                                                   "terminals": [{"terminal": "tW", "app": "claude-code"}]}]}], "recent": []}
    terms = [{"address": "tG", "agent": "claude-code", "state": "live", "status": "idle", "where": "Orca / #general"},
             {"address": "tO", "agent": "claude-code" if ops_live else "bash", "state": "live", "status": "idle" if ops_live else None,
              "where": "Orca / #ops"},
             {"address": "tW", "agent": "claude-code", "state": "live", "status": "idle", "where": "Worker / #general"}]
    get = "\n".join(f"    {t['address']}) cat <<'EOF'\n{json.dumps({**t, 'status': {'state': 'idle'}, 'labels': {'herdr.space': 's', 'where': t['where']}})}\nEOF\n;;"
                    for t in terms)
    (shims / "herdr-app").write_text(f"#!/bin/sh\n[ \"$1\" = ls ] && cat <<'EOF'\n{json.dumps(spaces)}\nEOF\n[ \"$1\" = ls ] && exit 0\nexit 1\n")
    (shims / "hc").write_text("#!/bin/sh\ncase \"$1\" in\n"
                              f"  ls) cat <<'EOF'\n{json.dumps({'terminals': terms})}\nEOF\n;;\n"
                              f"  get) case \"$2\" in\n{get}\n    *) exit 1 ;;\n  esac ;;\n"
                              "  read) printf '' ;;\n"
                              "  send) echo \"$2 $3\" >> \"$CREW_DATA/typed.log\" ;;\n"
                              "  *) exit 1 ;;\nesac\n")
    (shims / "systemctl").write_text("#!/bin/sh\nexit 1\n")
    for f in shims.iterdir():
        f.chmod(0o755)
    (data / "crew-settings.json").write_text(json.dumps({"owner": OWNER, "head": "Orca"}))
    (data / "crew-daemon.json").write_text(json.dumps({"at": time.time() + 3600, "pid": 1}))   # crewd "running": things queue
    (app / "shared.json").write_text(json.dumps({"crew": {"bots": [{"id": "g", "space": "s0", "name": "Orca", "god": True}]}}))
    env = {"HOME": str(home), "HERDR_APP_HOME": str(app), "CREW_DATA": str(data), "PATH": f"{shims}:/usr/bin:/bin", "LANG": "C.UTF-8"}
    return env, data


def queued(data, term):
    return [json.loads(f.read_text()) for f in sorted((data / "crew-queue" / term).glob("*.json"))] if (data / "crew-queue" / term).exists() else []


def set_topic(env, data, topic):
    r = owner(env, data, "settings", "head-topic", topic)
    assert r.returncode == 0, r.stderr
    return r


class HeadInbox(unittest.TestCase):
    def test_unset_nothing_changes(self):
        env, data = sandbox()
        self.assertEqual(py(env, "import crewlib; s, t = crewlib.find('Orca', crewlib.herdr_spaces()); print(json.dumps(t['name']))"), "#general")
        self.assertEqual(py(env, "import crewlib; print(json.dumps(crewlib.head_terminal(crewlib.herdr_spaces())))"), "tG")
        r = pal(env, "tell", "Orca", "hello", term="tW")
        self.assertIn("told Orca #general", r.stdout, r.stderr)

    def test_setting_it_needs_the_owners_click(self):
        env, data = sandbox()
        r = pal(env, "settings", "head-topic", "ops", term="tW")
        self.assertNotEqual(r.returncode, 0)
        self.assertNotIn("head_topic", json.loads((data / "crew-settings.json").read_text()))
        self.assertIn("#ops", set_topic(env, data, "#ops").stdout)
        self.assertEqual(json.loads((data / "crew-settings.json").read_text())["head_topic"], "ops")
        self.assertIn("head pal's inbox topic: #ops", pal(env, "settings").stdout)
        self.assertIn("none (the topic it shows, else its first tab)", set_topic(env, data, "none").stdout)
        self.assertNotIn("head_topic", json.loads((data / "crew-settings.json").read_text()))
        self.assertNotEqual(owner(env, data, "settings", "head-topic", "a b;c").returncode, 0)

    def test_every_push_without_a_topic_goes_to_the_inbox(self):
        env, data = sandbox()
        set_topic(env, data, "ops")
        # A pal addressing "Orca" with no #topic, and a card to its tray.
        self.assertIn("told Orca #ops", pal(env, "tell", "Orca", "status?", term="tW").stdout)
        r = pal(env, "desk", "send", "Orca", "please route this", term="tW")
        self.assertEqual(r.returncode, 0, r.stderr)
        cards = py(env, "import crewdesk; print(json.dumps([c['to'] for _, c in crewdesk.cards()]))")
        self.assertEqual(cards.count("Orca#ops"), 2, cards)
        self.assertNotIn("Orca#general", cards)
        # An explicit #topic still goes where it says.
        self.assertIn("told Orca #general", pal(env, "tell", "Orca#general", "for DeNon's chat", term="tW").stdout)
        # Dream digests and crewd's alerts (head_terminal), task notices to a creator named just "Orca".
        self.assertEqual(py(env, "import crewlib; print(json.dumps(crewlib.head_terminal(crewlib.herdr_spaces())))"), "tO")
        py(env, "import crewtasks, crewlib; print(json.dumps(crewtasks.notify('Orca', 'T9 done', crewlib.herdr_spaces(), 'crew')))")
        self.assertTrue(any(m["text"] == "T9 done" for m in queued(data, "tO")))
        self.assertFalse(any(m["text"] == "T9 done" for m in queued(data, "tG")))
        # The Desk check-in finds the head pal by name: its inbox too.
        self.assertEqual(py(env, "import crewlib; s, t = crewlib.find(crewlib.HEAD, crewlib.herdr_spaces()); print(json.dumps(t['name']))"), "#ops")

    def test_crewd_alerts_go_to_the_inbox(self):
        env, data = sandbox()
        set_topic(env, data, "ops")
        py(env, "import importlib.machinery, importlib.util, sys\n"
                "l = importlib.machinery.SourceFileLoader('crewd_t', sys.path[0] + '/crewd')\n"
                "m = importlib.util.module_from_spec(importlib.util.spec_from_loader('crewd_t', l)); l.exec_module(m)\n"
                "m.Crewd.tell_head(object.__new__(m.Crewd), 'Worker #general looks stuck')\nprint(1)")
        self.assertEqual([m["text"] for m in queued(data, "tO")], ["Worker #general looks stuck"])
        self.assertEqual(queued(data, "tG"), [])

    def test_only_the_head_pal_and_a_topic_it_has(self):
        env, data = sandbox(with_ops=False)
        set_topic(env, data, "ops")
        self.assertEqual(py(env, "import crewlib; s, t = crewlib.find('Orca', crewlib.herdr_spaces()); print(json.dumps(t['name']))"), "#general")
        self.assertEqual(py(env, "import crewlib; print(json.dumps(crewlib.head_terminal(crewlib.herdr_spaces())))"), "tG")
        # Another pal with an #ops topic isn't affected.
        self.assertEqual(py(env, "import crewlib; s, t = crewlib.find('Worker', crewlib.herdr_spaces()); print(json.dumps(t['name']))"), "#general")

    def test_an_inbox_with_no_agent_never_gets_typed_into(self):
        env, data = sandbox(ops_live=False)
        set_topic(env, data, "ops")
        # head_terminal only picks a topic with an agent: the alert goes to #general, not a bare shell.
        self.assertEqual(py(env, "import crewlib; print(json.dumps(crewlib.head_terminal(crewlib.herdr_spaces())))"), "tG")
        # A card to "Orca" waits on #ops's desk (held: asleep) rather than landing in #general.
        r = pal(env, "desk", "send", "Orca", "for the switchboard", term="tW")
        self.assertEqual(r.returncode, 0, r.stderr)
        [c] = [c for _, c in py(env, "import crewdesk; print(json.dumps([[0, c] for _, c in crewdesk.cards()]))")]
        self.assertEqual((c["to"], c["status"], c.get("held")), ("Orca#ops", "held", "asleep"))


if __name__ == "__main__":
    unittest.main()
