"""Phone-alert controls need owner actions; secret setup never uses argv or an echoed prompt."""
import json
import shutil
import subprocess
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_desk import sandbox, pal, owner, py

BIN = Path(__file__).resolve().parent.parent / "bin"


class NotifyCLI(unittest.TestCase):
    def setUp(self):
        self.root, self.env, self.data = sandbox()

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def test_status_is_read_only_and_mutations_require_owner_click(self):
        r = pal(self.env, "notify", "status", "--json", term="tW")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertFalse(json.loads(r.stdout)["enabled"])
        for args in (("disable",), ("enable",), ("test",), ("privacy", "detail")):
            for term in (None, "tW"):
                r = pal(self.env, "notify", *args, term=term)
                self.assertNotEqual(r.returncode, 0)
                self.assertIn("click", r.stderr + r.stdout)
        r = owner(self.env, self.data, "notify", "disable", "--json")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertFalse(json.loads(r.stdout)["enabled"])
        r = owner({**self.env, "PAL_HELPER": "Pals"}, self.data, "notify", "disable", "--json")
        self.assertNotEqual(r.returncode, 0, "a helper cannot use even a real owner token")

    def test_setup_rejects_agents_and_secret_arguments_without_echo(self):
        r = pal(self.env, "notify", "setup", term="tW")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("outside Herdr", r.stderr + r.stdout)
        for args in (("setup", "https://SECRET_CANARY.invalid", "KEY_CANARY"),
                     ("setup", "--key", "KEY_CANARY"), ("test", "KEY_CANARY")):
            r = pal(self.env, "notify", *args)
            self.assertNotEqual(r.returncode, 0)
            self.assertNotIn("CANARY", r.stdout + r.stderr)

    def test_report_never_reads_phone_credentials(self):
        got = py(self.env, '''
import os
from pathlib import Path
from unittest.mock import patch
import crewreport
folder=Path.home()/".config/project-pals/notify"
folder.mkdir(parents=True)
(folder/"credentials.json").write_text('{"url":"https://PRIVATE_CANARY.invalid","key":"KEY_CANARY"}')
opened=[]; real_open=os.open
def observed(path, *a, **k):
    opened.append(str(path))
    return real_open(path, *a, **k)
with patch("os.open", side_effect=observed), patch.object(crewreport, "probe", return_value=None):
    report=crewreport.report(Path(os.environ["CREW_DATA"]))
assert not any(str(folder) in p for p in opened)
print(json.dumps({"report":report}))
''')
        self.assertNotIn("CANARY", got["report"])

    def test_custom_header_is_case_insensitive_and_never_accepts_extra_arguments(self):
        got = py(self.env, """
import contextlib, io
from unittest.mock import patch
import crewnotifycli as cli
with patch.object(cli, "setup_interactive") as setup, contextlib.redirect_stdout(io.StringIO()):
    cli.run(["setup", "--header", "x-sender-key"], lambda *_: None)
    assert setup.call_args.kwargs["auth_header"] == "x-sender-key"
    setup.reset_mock()
    try: cli.run(["setup", "--header", "Authorization", "--header", "X-Other"], lambda *_: None)
    except cli.crewnotify.NotifyError: pass
    else: raise AssertionError("duplicate header accepted")
    assert not setup.called
print(json.dumps({"ok":True}))
""")
        self.assertTrue(got["ok"])

    def test_openbot_setup_mode_parsing(self):
        got = py(self.env, """
from unittest.mock import patch
import crewnotifycli as cli
with patch.object(cli, 'setup_interactive') as setup:
    with patch('builtins.print'):
        cli.run(['setup', '--mode', 'openbot'], lambda *_: None)
    assert setup.call_args.kwargs['mode'] == 'openbot'
    setup.reset_mock()
    for args in (['setup', '--mode', 'openbot', '--header', 'X-Key'], ['setup', '--mode', 'bad']):
        try: cli.run(args, lambda *_: None)
        except cli.crewnotify.NotifyError: pass
        else: raise AssertionError('invalid mode accepted')
    assert not setup.called
print(json.dumps({'ok': True}))
""")
        self.assertTrue(got['ok'])

    def test_secure_prompt_never_falls_back_to_echo_and_saves_disabled(self):
        out = py(self.env, '''
import io, warnings
from unittest.mock import patch
import crewnotifycli as cli
class TTY(io.StringIO):
    def fileno(self): return 77
    def close(self): pass
tty=TTY()
with patch("crewhelpers.inside_herdr", return_value=None), patch("crewuninstall.agent_above", return_value=None), patch("builtins.open", return_value=tty), patch("os.isatty", return_value=True), patch.object(cli.crewnotify, "configure") as config:
    with patch.object(cli.getpass, "getpass", side_effect=["https://SECRET_CANARY.invalid", "KEY_CANARY"]):
        cli.setup_interactive()
    saved = config.call_args
    assert saved.args == ("https://SECRET_CANARY.invalid", "KEY_CANARY")
    assert saved.kwargs == {"allow_plain":False,"privacy":"minimal","auth_header":"Authorization"}
    config.reset_mock()
    def fallback(*a, **k): warnings.warn("can't hide input", cli.getpass.GetPassWarning)
    with patch.object(cli.getpass, "getpass", side_effect=fallback):
        try: cli.setup_interactive()
        except cli.crewnotify.NotifyError: pass
        else: raise AssertionError("echo fallback must fail")
    assert not config.called
print(json.dumps({"shown": tty.getvalue()}))
''')
        self.assertNotIn("CANARY", out["shown"])

    def test_notify_credentials_and_unseal_are_guarded_but_source_status_is_free(self):
        got = py(self.env, '''
import crewguard
held = ["cat ~/.config/project-pals/notify/credentials", "cat project-pals/notify/state.json", "systemd-creds --user --name=pal-notify decrypt - -", "python3 -c 'import crewnotify; crewnotify._credentials()'", "python3 -c 'import crewnotify; crewnotify.send_test()'"]
free = ["cat bin/crewnotify.py", "pal notify status --json", "node --check mods/crew-notify/main.js"]
print(json.dumps({"held":[crewguard.touches_notify(x) or crewguard.touches_helpers(x) for x in held], "free":[crewguard.touches_notify(x) for x in free]}))
''')
        self.assertEqual(got["held"], [True] * 5)
        self.assertEqual(got["free"], [False] * 3)

    def test_file_tools_refuse_private_scopes_without_reading_credentials(self):
        home = Path(self.env["HOME"])
        keys = home / ".config/project-pals"
        keys.mkdir(parents=True)
        repo = self.root / "source"
        repo.mkdir()
        (repo / "alias").symlink_to(keys, target_is_directory=True)
        cases = [
            ("Read", {"file_path": str(keys / "notify/credentials.json")}, repo),
            ("Read", {"file_path": str(keys / "helpers/pals.key")}, repo),
            ("Read", {"file_path": "notify/credentials.json"}, keys),
            ("Edit", {"file_path": "notify/credentials.json", "old_string": "x", "new_string": "y"}, keys),
            ("Read", {"file_path": "alias/notify/credentials.json"}, repo),
            ("Grep", {"pattern": ".", "path": str(keys)}, repo),
            ("Grep", {"pattern": "."}, keys),
            ("Grep", {"pattern": ".", "path": str(home)}, repo),
            ("Glob", {"pattern": "**/*.json", "path": str(keys)}, repo),
            ("Glob", {"pattern": str(keys / "*/credentials.json")}, repo),
            ("Glob", {"pattern": "alias/**/*.json"}, repo),
        ]
        def hook(tool, args, cwd, term="tW"):
            event = {"tool_name": tool, "tool_input": args, "cwd": str(cwd)}
            env = {**self.env, **({"HC_TERMINAL_ID": term} if term else {})}
            r = subprocess.run([sys.executable, str(BIN / "crew-hook"), "pre-tool-use"],
                               input=json.dumps(event), text=True, capture_output=True, env=env, timeout=30)
            self.assertEqual(r.returncode, 0, r.stderr)
            return json.loads(r.stdout)["hookSpecificOutput"] if r.stdout.strip() else None
        for tool, args, cwd in cases:
            with self.subTest(tool=tool, args=args):
                result = hook(tool, args, cwd)
                self.assertEqual((result or {}).get("permissionDecision"), "deny")
                if tool != "Edit":
                    self.assertNotIn("credentials.json", result["permissionDecisionReason"])
        # Merely searching source for the protected path is not a secret read.
        for tool, args in [("Read", {"file_path": "bin/crewnotify.py"}),
                           ("Grep", {"pattern": str(keys / "notify/credentials.json"), "path": str(repo)}),
                           ("Grep", {"pattern": "from crewnotify import", "path": str(repo)}),
                           ("Glob", {"pattern": "**/*.py", "path": str(repo)})]:
            self.assertIsNone(hook(tool, args, repo))
        self.assertIsNone(hook("Read", {"file_path": str(keys / "notify/credentials.json")}, repo, term=None))
        self.assertEqual(list(keys.iterdir()), [], "checks never create or open credentials")

    def test_notify_imports_and_indirect_paths_are_guarded(self):
        got = py(self.env, r'''
import crewguard as g
from pathlib import Path
home = Path.home()
g.HOOK_CWD = str(home / ".config/project-pals/notify")
held = ["cat credentials.json", "python3 -c 'from crewnotify import _credentials; _credentials()'",
        "cat ~/.config/project-pals/*/credentials.json"]
free = ["rg 'from crewnotify import' bin", "python3 -c 'print(\"from crewnotify import\")'",
        "cat bin/crewnotify.py"]
inside = [g.touches_notify(x) for x in held]
g.HOOK_CWD = str(home / "source")
outside = [g.touches_notify(x) for x in free]
print(json.dumps({"held":inside, "free":outside}))
''')
        self.assertEqual(got["held"], [True] * 3)
        self.assertEqual(got["free"], [False] * 3)

    def test_purge_lists_and_removes_only_owned_alert_files_without_following_links(self):
        got = py(self.env, '''
import crewuninstall as u
from pathlib import Path
folder = u.USER / ".config/project-pals/notify"
folder.mkdir(parents=True)
for name in ("credentials.json", "state.json", "lock", "send.lock", ".credentials.json." + "a"*16, "my-note"):
    (folder/name).write_text("PRIVATE_CANARY")
dry = u.Run(True, lambda *_: None)
u.purge_notify(dry)
assert len(list(folder.iterdir())) == 6
assert "phone-alert credentials" in u.purge_list()
real = u.Run(False, lambda *_: None)
u.purge_notify(real)
assert [p.name for p in folder.iterdir()] == ["my-note"]
(folder/"my-note").unlink(); folder.rmdir()
outside=u.USER/"outside"; outside.mkdir(); (outside/"credentials.json").write_text("KEEP")
folder.symlink_to(outside, target_is_directory=True)
u.purge_notify(real)
assert (outside/"credentials.json").read_text() == "KEEP"
print(json.dumps({"kept_link":folder.is_symlink(), "notes":real.notes}))
''')
        self.assertTrue(got["kept_link"])
        self.assertNotIn("PRIVATE_CANARY", json.dumps(got))

    def test_purge_removes_empty_parent_but_preserves_helper_store(self):
        got = py(self.env, '''
import crewuninstall as u
folder = u.USER / ".config/project-pals/notify"
helpers = folder.parent / "helpers"
helpers.mkdir(parents=True)
folder.mkdir()
(folder / "state.json").write_text("{}")
u.purge_notify(u.Run(False, lambda *_: None))
assert helpers.is_dir() and not folder.exists()
helpers.rmdir()
folder.mkdir()
u.purge_notify(u.Run(False, lambda *_: None))
print(json.dumps({"removed_empty_parent":not folder.parent.exists()}))
''')
        self.assertTrue(got["removed_empty_parent"])
