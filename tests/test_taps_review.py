"""T186 regressions: disposable fixtures; held command strings are never executed."""
import json

from test_taps import Taps
from test_desk import pal, py, make_partner, cid_of, card
from test_helpers import helper


class ReviewBoundaries(Taps):
    def legacy_token(self, kind, iid, cls, choice):
        """A running hold/token from the pre-fix build; synthetic data only."""
        return py(self.env, f'''
import crewtaps, crewproposals, crewguard
from crewlib import save_json, now_ms
record = crewproposals.get({iid!r}) if {kind!r} == 'proposal' else next(a for a in crewguard.all_requests() if a['id'] == {iid!r})
h = dict(id='t-abc123', kind={kind!r}, item={iid!r}, cls={cls!r}, helper='Pals', choice={choice!r}, relayed='yes', status='running', hash=crewtaps.item_hash({kind!r}, record))
if {kind!r} == 'proposal':
    h['text_sha'] = crewproposals.text_sha(record)
crewtaps.HOLDS.mkdir(parents=True, exist_ok=True)
crewtaps.RUN.mkdir(parents=True, exist_ok=True)
save_json(crewtaps.HOLDS / 't-abc123.json', h)
nonce = 'ab' * 16
args = crewtaps._args(h)
save_json(crewtaps.RUN / (nonce + '.json'), dict(args=args, at=now_ms(), hold=h['id'], helper='Pals'))
print(json.dumps(args + ['--tap', nonce]))
''')

    def test_mission_proposals_never_get_a_ticket(self):
        for cls in ("home", "local", "outward"):
            self.switch(cls)
        proposed = self.root / "new-mission.md"
        proposed.write_text("# Mission\nChanged by a tap.\n")
        before = pal(self.env, "mission", "show", "Worker", "--json").stdout
        r = pal(self.env, "mission", "propose", "--file", str(proposed), term="tW")
        self.assertEqual(r.returncode, 0, r.stderr)
        pid = py(self.env, "import crewproposals; print(json.dumps(crewproposals.all_('pending')[-1]['id']))")
        row = self.tickets()[pid]
        self.assertNotIn("ticket", row)
        self.assertIn("own click", row["not_tappable"])
        self.assertEqual(pal(self.env, "mission", "show", "Worker", "--json").stdout, before)

    def test_legacy_mission_tap_is_refused_at_execution(self):
        self.switch("local")
        before = pal(self.env, "mission", "show", "Worker", "--json").stdout
        pid = py(self.env, "import crewproposals; print(json.dumps(crewproposals.propose('mission', 'Worker', 'Worker#general', 'new mission', base_sha=None)['id']))")
        r = pal(self.env, *self.legacy_token("proposal", pid, "local", "Accept"))
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("own click", r.stderr)
        self.assertEqual(pal(self.env, "mission", "show", "Worker", "--json").stdout, before)
        self.assertEqual(py(self.env, f"import crewproposals; print(json.dumps(crewproposals.get({pid!r})['status']))"), "pending")

    def test_brain_and_unknown_proposal_subtypes_are_not_tappable(self):
        self.switch("local")
        for kind, file, meta in (("agents", "_Brain/PROJECT_BRAIN.md", None), ("agents", ".pals/context.md", None),
                                 ("dream", None, {"kind": "context", "pal": "Worker"}), ("future-kind", None, None)):
            with self.subTest(kind=kind, file=file, meta=meta):
                pid = py(self.env, f"import crewproposals; print(json.dumps(crewproposals.propose({kind!r}, 'Worker', 'Worker#general', 'new text', file={file!r}, meta={meta!r})['id']))")
                self.assertNotIn("ticket", self.tickets()[pid])

    def test_protected_tail_makes_the_whole_command_untappable(self):
        self.switch("local")
        self.switch("outward")
        tails = {
            "helper-key": "cat ~/.config/project-pals/helpers/pals.key",
            "owner-click": "echo x > ~/.config/herdr-app/data/crew-clicks/a.json",
            "tap-write": "echo x > ~/.config/herdr-app/data/crew-taps/holds/t-aaaaaa.json",
            "uninstall": "./install.sh --uninstall",
        }
        for expected, tail in tails.items():
            with self.subTest(rule=expected):
                self.assertEqual(py(self.env, f"import crewguard; print(json.dumps(crewguard.matches({tail!r})['name']))"), expected)
                rid = self.held("printf x > AGENTS.md; " + tail)
                row = self.tickets()[rid]
                self.assertNotIn("ticket", row)
                self.assertEqual(self.approval(rid)["status"], "pending")

    def test_legacy_compound_tap_is_refused_at_execution(self):
        self.switch("local")
        rid = self.held("printf x > AGENTS.md; echo x > ~/.config/herdr-app/data/crew-clicks/a.json")
        r = pal(self.env, *self.legacy_token("approval", rid, "local", "Approve"))
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("tap token isn't good", r.stderr)  # refused before entering the decision
        self.assertEqual(self.approval(rid)["status"], "pending")

    def test_nested_outward_operation_keeps_class_but_needs_owner(self):
        self.switch("local")
        self.switch("outward")
        # The outer local edit must not hide the nested push from classification.
        command = 'printf x > AGENTS.md; python3 -c \'import os; os.system("git push origin main")\''
        rid = self.held(command)
        self.assertEqual(self.approval(rid)["rule"], "agents-file-shell")
        row = self.tickets()[rid]
        self.assertEqual(row["class"], "outward")
        self.assertNotIn("ticket", row)

    def test_changed_home_content_at_dispatch_is_not_answered(self):
        self.switch("home")
        iid = self.ask("Choose a panel style", ("A", "B"))
        hid = self.tapped(iid, "A")
        self.due(hid)
        py(self.env, '''
import crewtaps
original_run = crewtaps.subprocess.run
def at_dispatch(argv, *args, **kwargs):
    if '--tap' in argv:
        path = crewtaps.DATA / 'crew-home' / 'home.json'
        doc = json.loads(path.read_text())
        doc['items'][0]['title'] = 'Ship to production instead'
        doc['items'][0]['body'] = 'A now means ship'
        path.write_text(json.dumps(doc))
    return original_run(argv, *args, **kwargs)
crewtaps.subprocess.run = at_dispatch
crewtaps.run_due()
''')
        self.assertEqual(self.home()[0]["status"], "open")
        self.assertEqual(self.hold(hid)["status"], "failed")

    def test_home_validation_uses_the_snapshot_under_the_mutation_lock(self):
        self.switch("home")
        iid = self.ask("Choose a style", ("A", "B"))
        hid = self.tapped(iid, "A")
        result = py(self.env, f'''
import contextlib, crewtaps, crewhome
tap = crewtaps._hold({hid!r})
original_lock = crewhome.locked
@contextlib.contextmanager
def concurrent_edit(name):
    with original_lock(name):
        doc = crewhome.load()
        doc['items'][0]['body'] = 'A now means something else'
        crewhome._save(doc)
        yield
crewhome.locked = concurrent_edit
try:
    crewhome.answer({iid!r}, 'A', by='Pals', tapped=tap)
    print(json.dumps('answered'))
except crewtaps.TapError as e:
    print(json.dumps(str(e)))
''')
        self.assertIn("changed after it was tapped", result)
        self.assertEqual(self.home()[0]["status"], "open")

    def test_changed_approval_at_dispatch_stays_pending(self):
        self.switch("local")
        rid = self.held_edit()
        hid = self.tapped(rid, "Approve")
        self.due(hid)
        py(self.env, f'''
import crewtaps, crewguard
from crewlib import load_json, save_json, locked
original_run = crewtaps.subprocess.run
def at_dispatch(argv, *args, **kwargs):
    if '--tap' in argv:
        with locked('approvals'):
            path = crewguard.APPROVALS / ({rid!r} + '.json')
            record = load_json(path, {{}})
            record['command'] += '; echo x > ~/.config/herdr-app/data/crew-clicks/a.json'
            save_json(path, record)
    return original_run(argv, *args, **kwargs)
crewtaps.subprocess.run = at_dispatch
crewtaps.run_due()
''')
        self.assertEqual(self.approval(rid)["status"], "pending")
        self.assertEqual(self.hold(hid)["status"], "failed")

    def test_changed_draft_at_dispatch_creates_no_card_or_task(self):
        make_partner(self.root)
        self.switch("local")
        r = pal(self.env, "desk", "draft", "--to", "Worker#general", "--task", "Write the docs", term="tH")
        self.assertEqual(r.returncode, 0, r.stderr)
        cid = cid_of(r.stdout)
        hid = self.tapped(cid, "Send")
        self.due(hid)
        before = py(self.env, "import crewtasks; print(json.dumps(crewtasks.load()))")
        py(self.env, f'''
import crewtaps, crewdesk
original_run = crewtaps.subprocess.run
def at_dispatch(argv, *args, **kwargs):
    if '--tap' in argv:
        path = crewdesk.need({cid!r})
        with crewdesk.held_locks(path.parent.parent.name):
            record = crewdesk.read(path)
            record['body'] = 'Different work after the helper read the draft'
            crewdesk._write(path, record)
    return original_run(argv, *args, **kwargs)
crewtaps.subprocess.run = at_dispatch
crewtaps.run_due()
''')
        self.assertEqual(card(self.env, cid)["status"], "draft")
        self.assertEqual(py(self.env, "import crewtasks; print(json.dumps(crewtasks.load()))"), before)
        self.assertEqual(self.hold(hid)["status"], "failed")

    def test_cancelled_item_stays_dead_after_history_cleanup(self):
        self.switch("home")
        iid = self.ask("Still waiting", ("A", "B"))
        # Keep an unused ticket too: both issuing and consuming must consult the marker.
        stale = self.ticket(iid)
        hid = self.tapped(iid, "A")
        self.assertEqual(helper(self.env, "--as-helper", "tap-cancel", hid, name="").returncode, 0)
        path = self.dir / "holds" / (hid + ".json")
        hold = json.loads(path.read_text())
        hold["at"] -= 15 * 86400 * 1000
        hold["ended"] -= 15 * 86400 * 1000
        path.write_text(json.dumps(hold))
        # Also cover upgrading from a build that never wrote permanent markers.
        for marker in (self.dir / "used").glob("*.json"):
            marker.unlink()
        self.tapped(self.ask("Unrelated", ("A", "B")), "A")
        self.assertFalse(path.exists(), "display history still expires")
        self.refused(self.tap(stale, "A"), "tapped once already")
        self.assertNotIn("ticket", self.tickets()[iid])
