"""Phone-alert controls need owner actions; secret setup never uses argv or an echoed prompt."""
import json
import shutil
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_desk import sandbox, pal, owner, py


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
