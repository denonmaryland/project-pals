"""Relayed taps (T147): a trusted helper taps what waits on the owner, relaying the owner's word.
bin/crewtaps.py, `pal --as-helper taps | tap | tap-cancel`, `pal taps …`, the tap token in owner_gate.

DeNon's picks: "As asked, with holds" (h-5cadb2), "Build now, land after Codex" (h-8d5b13). What must
hold: nothing is tappable until the owner switches it on; a ticket pins one item as shown, one use;
a tap waits before it runs and can be stopped; it is recorded and told as a tap, never as the
owner's click; and the things that decide who may act as whom can't be tapped at all.

Throwaway CREW_DATA and HOME with fake hc / herdr-app, as the Desk tests. Tickets and holds are aged
by editing their files (the tests don't wait twenty seconds or five minutes).
    python3 -m unittest discover -s tests
"""
import json
import shutil
import sys
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_desk import pal, owner, py, card, queue, cid_of, make_partner, OWNER  # noqa: E402
from test_helpers import Base, helper, log  # noqa: E402

TAPS = "crew-taps"


class Taps(Base):
    def setUp(self):
        super().setUp()
        self.on()
        self.dir = self.data / TAPS

    # ── what the tests set up ──

    def switch(self, what, value="on", name="Pals"):
        r = owner(self.env, self.data, "settings", "trust-helper", name, "taps", what, value)
        self.assertEqual(r.returncode, 0, r.stderr)
        return r

    def ask(self, title="Recessed or flat?", options=("Recessed", "Flat"), term="tW", extra=()):
        args = ["home", "ask", title]
        for o in options:
            args += ["--option", o]
        r = pal(self.env, *args, *extra, term=term)
        self.assertEqual(r.returncode, 0, r.stderr)
        return self.home()[-1]["id"]

    def home(self):
        return json.loads((self.data / "crew-home" / "home.json").read_text())["items"]

    def held(self, cmd="git push origin main", term="tH", pal_="Helper", topic="build", extra=None):
        code = f"import crewguard\ncrewguard.HOOK_CWD = {str(self.root)!r}\nr = crewguard.check({term!r}, {pal_!r}, {topic!r}, {cmd!r}, {extra!r})\nprint(json.dumps(r['id']))"
        return py(self.env, code)

    def held_edit(self):
        return self.held("edit /w/AGENTS.md [edit aaaaaaaaaaaa, base bbbbbbbbbbbb]",
                         extra=dict(path="/w/AGENTS.md", edit_hash="aaaaaaaaaaaa", base_hash="bbbbbbbbbbbb", diff="-old\n+new"))

    def approval(self, rid):
        return json.loads((self.data / "crew-approvals" / f"{rid}.json").read_text())

    def tickets(self):
        r = helper(self.env, "--as-helper", "taps", "--json", name="")
        self.assertEqual(r.returncode, 0, r.stderr)
        return {x["id"]: x for x in json.loads(r.stdout)["items"]}

    def ticket(self, iid, aged=True):
        t = self.tickets()[iid]
        self.assertIn("ticket", t, t.get("not_tappable"))
        if aged:
            self.age(t["ticket"])
        return t["ticket"]

    def age(self, ticket, seconds=30):
        f = self.dir / "tickets" / f"{ticket}.json"
        t = json.loads(f.read_text())
        t["made"] -= seconds * 1000
        f.write_text(json.dumps(t))

    def tap(self, ticket, choice, relayed="yes, that one"):
        return helper(self.env, "--as-helper", "tap", ticket, choice, "--relayed", relayed, "--json", name="")

    def tapped(self, iid, choice, relayed="yes, that one"):
        r = self.tap(self.ticket(iid), choice, relayed)
        self.assertEqual(r.returncode, 0, r.stderr)
        return json.loads(r.stdout)["hold"]

    def hold(self, hid):
        return json.loads((self.dir / "holds" / f"{hid}.json").read_text())

    def due(self, hid):
        f = self.dir / "holds" / f"{hid}.json"
        h = json.loads(f.read_text())
        h["run_at"] = 0
        f.write_text(json.dumps(h))

    def run_due(self):
        r = pal(self.env, "taps", "run")
        self.assertEqual(r.returncode, 0, r.stderr)
        return r.stdout

    def refused(self, r, why):
        self.assertEqual(r.returncode, 5, r.stdout + r.stderr)
        self.assertIn(why, r.stderr)

    def forget_refusals(self):
        """As if ten minutes had passed: earlier refused taps no longer count toward the switch-off."""
        f = self.data / "crew-helpers" / "log.jsonl"
        f.write_text("".join(l + "\n" for l in f.read_text().splitlines() if json.loads(l).get("kind") != "tap-refused"))

    def record(self, kind):
        return [e for e in log(self.data) if e["kind"] == kind]


class OffUntilTheOwnersClick(Taps):
    def test_nothing_is_tappable_until_its_switch_is_on(self):
        iid, rid = self.ask(), self.held()
        rows = self.tickets()
        self.assertNotIn("ticket", rows[iid])
        self.assertIn("switched off for Pals", rows[iid]["not_tappable"])
        self.assertNotIn("ticket", rows[rid])
        # The exact text is shown either way: the helper can still tell the owner what waits.
        self.assertIn("Recessed or flat?", rows[iid]["text"])
        self.assertIn("git push origin main", rows[rid]["text"])
        self.assertFalse((self.dir / "tickets").exists() and list((self.dir / "tickets").glob("*.json")))
        # Each class has its own switch.
        self.switch("home")
        rows = self.tickets()
        self.assertIn("ticket", rows[iid])
        self.assertNotIn("ticket", rows[rid], "the outward switch is still off")

    def test_only_the_owners_click_turns_a_tap_switch(self):
        for r in (pal(self.env, "settings", "trust-helper", "Pals", "taps", "outward", "on"),
                  pal(self.env, "settings", "trust-helper", "Pals", "taps", "outward", "on", term="tW"),
                  helper(self.env, "settings", "trust-helper", "Pals", "taps", "outward", "on"),
                  helper(self.env, "--as-helper", "settings", "trust-helper", "Pals", "taps", "home", "on", name="")):
            self.assertNotEqual(r.returncode, 0)
        sw = json.loads(pal(self.env, "helpers", "--json").stdout)["helpers"][0]["taps"]
        self.assertEqual((sw["home"], sw["local"], sw["outward"], sw["hold"]), (False, False, False, 5))
        for bad in (["everything", "on"], ["home", "maybe"], ["hold", "16"], ["hold", "-1"], ["hold", "soon"]):
            self.assertNotEqual(owner(self.env, self.data, "settings", "trust-helper", "Pals", "taps", *bad).returncode, 0, bad)
        self.switch("outward")
        self.switch("hold", "2")
        sw = json.loads(pal(self.env, "helpers", "--json").stdout)["helpers"][0]["taps"]
        self.assertEqual((sw["outward"], sw["hold"]), (True, 2))

    def test_switching_the_helper_off_switches_its_taps_off_and_they_stay_off(self):
        for c in ("home", "local", "outward"):
            self.switch(c)
        owner(self.env, self.data, "settings", "trust-helper", "Pals", "off")
        self.assertNotEqual(owner(self.env, self.data, "settings", "trust-helper", "Pals", "taps", "home", "on").returncode, 0, "not while the helper is off")
        self.on()
        sw = json.loads(pal(self.env, "helpers", "--json").stdout)["helpers"][0]["taps"]
        self.assertEqual((sw["home"], sw["local"], sw["outward"]), (False, False, False))

    def test_tapping_is_a_helpers_with_its_key_from_outside_herdr(self):
        self.switch("home")
        iid = self.ask()
        ticket = self.ticket(iid)
        for r in (pal(self.env, "tap", ticket, "Recessed", "--relayed", "x"),                       # a shell, presenting nothing
                  pal(self.env, "tap", ticket, "Recessed", "--relayed", "x", term="tW"),            # a pal
                  helper(self.env, "--as-helper", "tap", ticket, "Recessed", "--relayed", "x", name="", term="tW", outside=False),   # a pal with the flag
                  helper(self.env, "tap", ticket, "Recessed", "--relayed", "x", name="Wabi")):      # a name with no such helper
            self.assertNotEqual(r.returncode, 0)
        self.assertEqual(self.home()[0]["status"], "open")
        self.assertFalse((self.dir / "holds").exists() and list((self.dir / "holds").glob("*.json")))
        # Another trusted helper can't use Pals's ticket.
        self.on("Wabi")
        self.switch("home", name="Wabi")
        self.refused(helper(self.env, "tap", ticket, "Recessed", "--relayed", "x", name="Wabi"), "made for another helper")


class Tickets(Taps):
    def setUp(self):
        super().setUp()
        self.switch("home")
        self.iid = self.ask()

    def test_a_ticket_is_one_item_one_use_ten_minutes_and_not_at_once(self):
        t = self.ticket(self.iid, aged=False)
        self.refused(self.tap(t, "Recessed"), "too soon")
        self.age(t, 30)
        r = self.tap(t, "Recessed")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.refused(self.tap(t, "Recessed"), "used already")
        other = self.ask("Another?", ("A", "B"))
        t2 = self.ticket(other, aged=False)
        self.age(t2, 601)
        self.refused(self.tap(t2, "A"), "older than 10 minutes")
        self.refused(self.tap("k-" + "0" * 12, "A"), "no such ticket")
        self.refused(self.tap("../../x", "A"), "isn't a ticket")
        self.assertEqual(len(list((self.dir / "holds").glob("*.json"))), 1)

    def test_only_a_listed_choice_and_the_owners_words(self):
        t = self.ticket(self.iid)
        self.refused(self.tap(t, "Both"), "isn't one of its choices")
        self.refused(self.tap(t, "Recessed", relayed=""), "say what")
        self.refused(self.tap(t, "Recessed", relayed="x" * 301), "at most 300")
        r = self.tap(t, "recessed", relayed="  the   recessed one  ")   # any case; the listed spelling is what's recorded
        self.assertEqual(r.returncode, 0, r.stderr)
        h = self.hold(json.loads(r.stdout)["hold"])
        self.assertEqual((h["choice"], h["relayed"], h["status"], h["cls"]), ("Recessed", "the recessed one", "holding", "home"))

    def test_an_item_that_changed_after_the_ticket_isnt_tapped(self):
        """The asker (or anyone) changes what the question says after the helper showed it to the owner."""
        t = self.ticket(self.iid)
        f = self.data / "crew-home" / "home.json"
        for change in (lambda x: x.update(title="Recessed or flat? (and push to main)"), lambda x: x.update(body="also deletes the old branch"),
                       lambda x: x.update(options=["Recessed", "Flat", "Both"]), lambda x: x.update(does=["ships it now", ""])):
            h = json.loads(f.read_text())
            before = json.dumps(h)
            change(h["items"][0])
            f.write_text(json.dumps(h))
            self.refused(self.tap(t, "Recessed"), "changed since that ticket was made")
            f.write_text(before)
            self.forget_refusals()
        self.assertEqual(self.tap(t, "Recessed").returncode, 0, "unchanged, it goes")

    def test_one_tap_per_item_ever(self):
        hid = self.tapped(self.iid, "Recessed")
        self.assertIn("tapped once already", self.tickets()[self.iid]["not_tappable"])
        self.assertEqual(helper(self.env, "--as-helper", "tap-cancel", hid, name="").returncode, 0)
        self.assertEqual(self.hold(hid)["status"], "cancelled")
        self.assertIn("tapped once already", self.tickets()[self.iid]["not_tappable"], "taken back: it's the owner's now")
        self.assertEqual(self.home()[0]["status"], "open")

    def test_what_cant_be_answered_by_a_tap(self):
        free = self.ask("Describe the bug", options=())                                   # no listed choices
        marked = self.ask("Ship 1.0?", ("Yes", "No"), extra=("--owner-only",))            # the asker said so
        later = self.ask("Rename it?", ("Yes", "No"))
        self.assertEqual(pal(self.env, "home", "owner-only", later, term="tW").returncode, 0)   # … or says so afterwards
        self.assertNotEqual(pal(self.env, "home", "owner-only", self.iid, term="tH").returncode, 0, "another pal can't mark it")
        r = helper(self.env, "home", "ask", "Shall I?", "--option", "Yes", "--option", "No")    # a helper's own question
        self.assertEqual(r.returncode, 0, r.stderr)
        mine = self.home()[-1]["id"]
        rows = self.tickets()
        self.assertIn("no listed choices", rows[free]["not_tappable"])
        self.assertIn("own click", rows[marked]["not_tappable"])
        self.assertIn("own click", rows[later]["not_tappable"])
        self.assertIn("a helper doesn't answer a helper's question", rows[mine]["not_tappable"])
        self.assertIn("ticket", rows[self.iid])
        # Marked after the ticket was made: the tap is refused, and nothing a tap token could do answers it.
        t = self.ticket(self.iid)
        self.assertEqual(pal(self.env, "home", "owner-only", self.iid, term="tW").returncode, 0)
        self.refused(self.tap(t, "Recessed"), "can't be tapped")


class HeldThenRun(Taps):
    def setUp(self):
        super().setUp()
        self.switch("home")
        self.iid = self.ask()

    def test_a_tapped_answer_waits_then_goes_as_a_tap_never_as_the_owner(self):
        hid = self.tapped(self.iid, "Recessed", "recessed, obviously")
        h = self.hold(hid)
        self.assertAlmostEqual((h["run_at"] - h["at"]) / 1000, 60, delta=2)
        self.assertEqual(self.run_due(), "", "not before its hold is over")
        self.assertEqual(self.home()[0]["status"], "open")
        self.assertEqual(queue(self.data, "tW") if (self.data / "crew-queue" / "tW").exists() else [], [], "the asker hasn't heard")
        self.due(hid)
        self.assertIn("done", self.run_due())
        x = self.home()[0]
        self.assertEqual((x["status"], x["answer"], x["closed_by"]), ("answered", "Recessed", f"Pals (tapped, relayed from {OWNER})"))
        self.assertEqual((x["tapped"]["by"], x["tapped"]["relayed"], x["tapped"]["hold"]), ("Pals", "recessed, obviously", hid))
        told = queue(self.data, "tW")[-1]["text"]
        self.assertTrue(told.startswith("[pal] "), told)
        self.assertNotIn(f"[from {OWNER}]", told)
        self.assertIn("tapped by Pals, relayed from", told)
        self.assertIn('"recessed, obviously"', told)
        self.assertIn("not Dee Tester's own click", told)
        c = [c for c in py(self.env, "import crewdesk; print(json.dumps([crewdesk.summary(c, p) for p, c in crewdesk.cards(where=('open', 'done'))]))")
             if c["title"].startswith(f"Re {self.iid}")][0]
        self.assertEqual((c["from_kind"], c["verified"]), ("system", False), "not an owner card")
        self.assertEqual(self.hold(hid)["status"], "done")
        self.assertEqual(self.run_due(), "", "once")
        kinds = [e["kind"] for e in log(self.data) if e["kind"].startswith("tap")]
        self.assertEqual(kinds, ["tap", "tap-done"])
        self.assertFalse(list((self.dir / "run").glob("*.json")), "its token is used up")

    def test_the_owners_stop_and_the_helpers_cancel_end_it_unrun(self):
        hid = self.tapped(self.iid, "Recessed")
        for r in (pal(self.env, "taps", "stop", hid), pal(self.env, "taps", "stop", hid, term="tW"), helper(self.env, "taps", "stop", hid)):
            self.assertNotEqual(r.returncode, 0, "stopping is the owner's click")
        self.assertEqual(owner(self.env, self.data, "taps", "stop", hid).returncode, 0)
        self.due(hid)
        self.assertEqual(self.run_due(), "")
        self.assertEqual((self.hold(hid)["status"], self.home()[0]["status"]), ("stopped", "open"))
        self.assertNotEqual(helper(self.env, "--as-helper", "tap-cancel", hid, name="").returncode, 0, "nothing left to take back")
        # Another helper can't cancel this one's tap.
        other = self.ask("Second?", ("A", "B"))
        hid2 = self.tapped(other, "A")
        self.on("Wabi")
        self.assertNotEqual(helper(self.env, "tap-cancel", hid2, name="Wabi").returncode, 0)
        self.assertEqual(self.hold(hid2)["status"], "holding")

    def test_let_it_go_now_is_the_owners(self):
        hid = self.tapped(self.iid, "Flat")
        self.assertNotEqual(pal(self.env, "taps", "now", hid).returncode, 0)
        r = owner(self.env, self.data, "taps", "now", hid)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("done", r.stdout)
        self.assertEqual(self.home()[0]["answer"], "Flat")

    def test_undo_reopens_the_question_for_the_owner_alone_and_tells_the_asker_to_stop(self):
        hid = self.tapped(self.iid, "Recessed")
        self.due(hid)
        self.run_due()
        self.assertNotEqual(pal(self.env, "taps", "undo", hid, term="tW").returncode, 0)
        r = owner(self.env, self.data, "taps", "undo", hid)
        self.assertEqual(r.returncode, 0, r.stderr)
        x = self.home()[0]
        self.assertEqual((x["status"], x.get("answer"), x.get("owner_only"), x["untapped"]["answer"]), ("open", None, True, "Recessed"))
        told = queue(self.data, "tW")[-1]["text"]
        self.assertIn("Stop:", told)
        self.assertIn("undid the tap", told)
        self.assertEqual(self.hold(hid)["status"], "undone")
        self.assertIn("own click", self.tickets()[self.iid]["not_tappable"])
        # The owner's own answer then stands as theirs.
        self.assertEqual(owner(self.env, self.data, "home", "answer", self.iid, "Flat").returncode, 0)
        x = self.home()[0]
        self.assertEqual((x["answer"], x["closed_by"], x.get("tapped")), ("Flat", OWNER, None))

    def test_a_hold_is_dropped_when_things_changed_while_it_waited(self):
        for change, why in ((lambda: owner(self.env, self.data, "settings", "trust-helper", "Pals", "taps", "home", "off"), "switched off"),
                            (lambda: owner(self.env, self.data, "settings", "trust-helper", "Pals", "off"), "isn't a trusted helper"),
                            (lambda: pal(self.env, "home", "drop", self.iid, term="tW"), "wasn't waiting any more")):
            self.on()
            self.switch("home")
            self.iid = self.ask(f"Q {why}?")
            hid = self.tapped(self.iid, "Recessed")
            change()
            self.due(hid)
            self.assertIn("dropped", self.run_due())
            h = self.hold(hid)
            self.assertEqual(h["status"], "dropped")
            self.assertIn(why, h["result"])
            self.assertNotEqual([x for x in self.home() if x["id"] == self.iid][0].get("answer"), "Recessed")
        # … and when the question was edited after the tap (the asker rewording what was agreed to).
        self.on()
        self.switch("home")
        iid = self.ask("Last one?")
        hid = self.tapped(iid, "Recessed")
        f = self.data / "crew-home" / "home.json"
        h = json.loads(f.read_text())
        [x for x in h["items"] if x["id"] == iid][0]["body"] = "and force-push"
        f.write_text(json.dumps(h))
        self.due(hid)
        self.run_due()
        self.assertIn("changed after it was tapped", self.hold(hid)["result"])


class Approvals(Taps):
    def test_an_outward_tap_is_the_approval_held_five_minutes_and_says_who(self):
        self.switch("outward")
        rid = self.held("git push origin main")
        hid = self.tapped(rid, "Approve", "yes push it")
        h = self.hold(hid)
        self.assertEqual((h["cls"], h["rule"]), ("outward", "push"))
        self.assertAlmostEqual((h["run_at"] - h["at"]) / 1000, 300, delta=2)
        self.assertEqual(self.approval(rid)["status"], "pending", "held: nothing is approved yet")
        self.due(hid)
        self.run_due()
        a = self.approval(rid)
        self.assertEqual(a["status"], "approved")
        self.assertEqual(a["decided_via"], f"a tap by Pals, relayed from {OWNER} (hold {hid})")
        told = queue(self.data, "tH")[-1]["text"]
        self.assertIn("Pals tapped, relaying", told)
        self.assertIn("not Dee Tester's own click", told)
        self.assertNotIn(f"{OWNER} approved", told)
        # The pal's command then goes through, once, as with any approval.
        self.assertIsNone(py(self.env, f"import crewguard\ncrewguard.HOOK_CWD = {str(self.root)!r}\nprint(json.dumps(crewguard.check('tH', 'Helper', 'build', 'git push origin main')))"))
        self.assertEqual(self.approval(rid)["status"], "used")

    def test_decline_by_tap(self):
        self.switch("outward")
        rid = self.held("gh pr merge 4")
        hid = self.tapped(rid, "Decline", "no, not yet")
        self.due(hid)
        self.run_due()
        self.assertEqual(self.approval(rid)["status"], "denied")
        self.assertIn("said no to", queue(self.data, "tH")[-1]["text"])

    def test_the_hold_is_the_owners_setting(self):
        self.switch("outward")
        self.switch("hold", "0")
        hid = self.tapped(self.held(), "Approve")
        self.assertIn("done", self.run_due(), "0 minutes: it goes at once")
        self.assertEqual(self.hold(hid)["status"], "done")

    def test_local_approvals_have_their_own_switch_and_the_short_hold(self):
        self.switch("local")
        local = self.held_edit()
        out = self.held("git push origin main")
        rows = self.tickets()
        self.assertEqual((rows[local]["class"], rows[local]["hold_seconds"]), ("local", 60))
        self.assertIn("ticket", rows[local])
        self.assertIn("switched off", rows[out]["not_tappable"])
        hid = self.tapped(local, "Approve")
        self.due(hid)
        self.run_due()
        self.assertEqual(self.approval(local)["status"], "approved")

    def test_commands_that_decide_who_may_act_as_whom_are_never_tappable(self):
        for c in ("home", "local", "outward"):
            self.switch(c)
        cmds = {"helper-key": "PAL_HELPER=Pals pal tell Worker now", "owner-click": "echo x > ~/.config/herdr-app/data/crew-clicks/a.json",
                "queue-write": "echo x > ~/.config/herdr-app/data/crew-queue/tW/a.json", "desk-write": "echo x > ~/.config/herdr-app/data/crew-desk/x/open/a.md",
                "tap-write": "echo x > ~/.config/herdr-app/data/crew-taps/holds/t-aaaaaa.json", "uninstall": "./install.sh --uninstall"}
        rids = {rule: self.held(cmd) for rule, cmd in cmds.items()}
        rows = self.tickets()
        for rule, rid in rids.items():
            self.assertEqual(self.approval(rid)["rule"], rule)
            self.assertNotIn("ticket", rows[rid], rule)
            self.assertIn("own click only", rows[rid]["not_tappable"], rule)
        # A new/custom rule has no delegated class: only the owner's click may answer it.
        pol = self.data / "crew-policy.json"
        p = json.loads(pol.read_text())
        p["guarded"].append({"name": "my-rule", "why": "mine", "pattern": r"^my-tool\b"})
        pol.write_text(json.dumps(p))
        mine = self.held("my-tool go")
        self.assertNotIn("ticket", self.tickets()[mine])
        self.assertIn("unclassified rule", self.tickets()[mine]["not_tappable"])

    def test_outward_taps_five_a_day_and_one_at_a_time(self):
        self.switch("outward")
        rids = [self.held(f"git push origin b{i}") for i in range(7)]
        first = self.tapped(rids[0], "Approve")
        self.refused(self.tap(self.ticket(rids[1]), "Approve"), "one at a time")
        self.due(first)
        self.run_due()
        for rid in rids[1:5]:
            hid = self.tapped(rid, "Approve")
            self.due(hid)
            self.run_due()
        self.refused(self.tap(self.ticket(rids[5]), "Approve"), "5 outward taps a day")
        self.assertEqual(self.approval(rids[5])["status"], "pending")
        # A day later it may again.
        for f in (self.dir / "holds").glob("*.json"):
            h = json.loads(f.read_text())
            h["at"] -= 25 * 3600 * 1000
            f.write_text(json.dumps(h))
        self.assertEqual(self.tap(self.ticket(rids[5]), "Approve").returncode, 0)

    def test_three_refused_taps_in_ten_minutes_switch_tapping_off_and_say_so(self):
        self.switch("home")
        self.switch("outward")
        iid, rid = self.ask(), self.held()
        hid = self.tapped(rid, "Approve")
        for _ in range(3):
            self.refused(self.tap("k-" + "0" * 12, "Recessed"), "no such ticket")
        sw = json.loads(pal(self.env, "helpers", "--json").stdout)["helpers"][0]
        self.assertEqual((sw["on"], sw["taps"]["home"], sw["taps"]["outward"]), (True, False, False), "the helper stays on; its taps go off")
        self.assertEqual(self.hold(hid)["status"], "dropped", "what it had in hand is dropped")
        att = json.loads((self.data / "crew-helpers" / "attention.json").read_text())["Pals"]
        self.assertEqual(att["reason"], "taps-off")
        self.assertIn("not by you", att["text"])
        self.assertIn("switched off", self.tickets()[iid]["not_tappable"])
        self.assertTrue(self.told(helper(self.env, "tell", "Helper#build", "still sends"))[1].startswith(f"[from {OWNER} via Pals"))
        # The owner turning a tap switch on again answers the notice.
        self.switch("home")
        self.assertEqual(json.loads((self.data / "crew-helpers" / "attention.json").read_text()), {})
        # Refusals that are nobody's fault don't count: a limit, an item already tapped.
        other = self.ask("Another?")
        self.tapped(other, "Recessed")
        for _ in range(4):
            self.refused(self.tap(self.ticket(other) if "ticket" in self.tickets()[other] else "k-" + "1" * 12, "Recessed"), "")
        # (those four were unknown tickets again: counted, so tapping is off once more)
        self.assertFalse(json.loads(pal(self.env, "helpers", "--json").stdout)["helpers"][0]["taps"]["home"])


class ProposalsAndDrafts(Taps):
    def setUp(self):
        super().setUp()
        make_partner(self.root)
        self.switch("local")

    def test_a_tapped_draft_goes_out_as_its_drafters_card_not_the_owners(self):
        r = pal(self.env, "desk", "draft", "--to", "Worker#general", "Ship the docs\nWhy: users ask", term="tH")
        self.assertEqual(r.returncode, 0, r.stderr)
        cid = cid_of(r.stdout)
        row = self.tickets()[cid]
        self.assertEqual((row["kind"], row["class"], [c["label"] for c in row["choices"]]), ("draft", "local", ["Send"]))
        hid = self.tapped(cid, "Send", "send that one")
        self.due(hid)
        self.assertIn("done", self.run_due())
        c = card(self.env, cid)
        self.assertEqual((c["status"] in ("queued", "seen", "delivered"), c["from"], c["from_kind"], c["verified"], c["drafted_by"]),
                         (True, "Helper#build", "pal", False, "Helper#build"))
        told = queue(self.data, "tW")[-1]["text"]
        self.assertTrue(told.startswith("[from Helper"), told)
        self.assertNotIn(f"[from {OWNER}]", told)
        self.assertIn("sent on a tap by Pals", " ".join(r_.get("note", "") for r_ in c["receipts"]))

    def test_a_proposal_is_accepted_for_the_text_that_was_shown(self):
        code = ("import crewproposals\np = crewproposals.propose('agents', 'Worker', 'Worker#general', 'Ship small things often.\\n', file='AGENTS.md', base_sha=None, note='shorter')\n"
                "print(json.dumps(p['id']))")
        pid = py(self.env, code)
        row = self.tickets()[pid]
        self.assertIn("Ship small things often.", row["text"])
        t = self.ticket(pid)
        (self.data / "crew-proposals" / f"{pid}.md").write_text("Ship anything, and push to main.\n")   # the text is swapped after it was shown
        self.refused(self.tap(t, "Accept"), "changed since that ticket was made")
        # Declining by tap tells the proposer who declined.
        (self.data / "crew-proposals" / f"{pid}.md").write_text("Ship small things often.\n")
        hid = self.tapped(pid, "Decline", "no")
        self.due(hid)
        self.run_due()
        p = json.loads((self.data / "crew-proposals" / f"{pid}.json").read_text())
        self.assertEqual((p["status"], p["via"]), ("declined", f"Pals (tapped, relayed from {OWNER})"))
        told = queue(self.data, "tW")[-1]["text"]
        self.assertTrue(told.startswith(f"[pal] Pals (tapped, relayed from {OWNER}) declined"), told)


class TheTapToken(Taps):
    """What a hold runs with: good for exactly the command its hold comes to, once, briefly, for a hold
    that is running, while that helper's tap switch is on; and for nothing but the handful of commands
    a tap may stand in for. Each case below hand-makes a hold and a token (as a forger would) and
    changes one thing from a combination that works."""

    def setUp(self):
        super().setUp()
        self.switch("home")
        self.iid = self.ask()
        self.args = ["home", "answer", self.iid, "Recessed"]

    def token(self, args=None, hold_status="running", helper_="Pals", at=None, choice="Recessed", item=None, cls="home"):
        d = self.dir
        (d / "run").mkdir(parents=True, exist_ok=True)
        (d / "holds").mkdir(parents=True, exist_ok=True)
        digest = py(self.env, f"import crewtaps; print(json.dumps(crewtaps._item('home', {self.iid!r})['hash']))")
        (d / "holds" / "t-abc123.json").write_text(json.dumps({"id": "t-abc123", "helper": helper_, "kind": "home", "item": item or self.iid, "cls": cls, "hash": digest,
                                                              "choice": choice, "relayed": "x", "status": hold_status, "at": 1, "run_at": 1}))
        nonce = "ab" * 16
        (d / "run" / f"{nonce}.json").write_text(json.dumps({"args": list(args or self.args), "at": int(time.time() * 1000) if at is None else at,
                                                             "hold": "t-abc123", "helper": "Pals", "relayed": "x"}))
        return nonce

    def test_the_combination_that_works_and_says_it_was_a_tap(self):
        r = pal(self.env, *self.args, "--tap", self.token())
        self.assertEqual(r.returncode, 0, r.stderr)
        x = self.home()[0]
        self.assertEqual((x["answer"], x["closed_by"], x["tapped"]["by"]), ("Recessed", f"Pals (tapped, relayed from {OWNER})", "Pals"))

    def test_with_the_tap_switch_off_a_token_opens_nothing(self):
        """Taps are off by default: until the owner turns one on, this door doesn't exist at all."""
        self.switch("home", "off")
        self.assertNotEqual(pal(self.env, *self.args, "--tap", self.token()).returncode, 0)
        self.switch("home")
        owner(self.env, self.data, "settings", "trust-helper", "Pals", "off")
        self.assertNotEqual(pal(self.env, *self.args, "--tap", self.token()).returncode, 0, "nor with the helper switched off")
        self.assertEqual(self.home()[0]["status"], "open")

    def test_a_tap_token_is_never_good_for_anything_but_what_its_hold_comes_to(self):
        before = (self.data / "crew-settings.json").read_text()
        for args in (["settings", "owner", "Mallory"], ["settings", "trust-helper", "Wabi", "on"], ["settings", "trust-helper", "Pals", "taps", "outward", "on"],
                     ["settings", "trust-helper", "Pals", "rotate"], ["home", "seen"], ["taps", "now", "t-abc123"], ["taps", "stop", "t-abc123"],
                     ["update", "apply"], ["renamed", "Worker", "Mallory"], ["mission", "set", "--pal", "Worker", "--file", "/dev/null"],
                     ["desk", "confirm", "c-000000"], ["desk", "urgency", "c-000000", "now"], ["land", "Worker#general"],
                     ["approve", "a-000000"], ["home", "answer", self.iid, "Flat"]):
            r = pal(self.env, *args, "--tap", self.token(args))
            self.assertNotEqual(r.returncode, 0, args)
        self.assertEqual((self.data / "crew-settings.json").read_text(), before)
        sw = json.loads(pal(self.env, "helpers", "--json").stdout)["helpers"]
        self.assertEqual(([h["name"] for h in sw], sw[0]["taps"]["outward"]), (["Pals"], False))
        self.assertEqual(self.home()[0]["status"], "open")
        code = ("import crewtaps\nprint(json.dumps([list(p) for p in crewtaps.TAPPABLE]))")
        self.assertEqual(py(self.env, code), [["home", "answer"], ["approve"], ["deny"], ["proposal", "accept"], ["proposal", "decline"], ["desk", "send-draft"]])

    def test_one_thing_wrong_and_it_isnt_good(self):
        cases = {"written for another choice than its hold's": dict(args=["home", "answer", self.iid, "Flat"]),
                 "the hold says another choice": dict(choice="Flat"),
                 "an old token": dict(at=int(time.time() * 1000) - 200 * 1000),
                 "a hold that isn't running": dict(hold_status="stopped"),
                 "a hold that's still waiting": dict(hold_status="holding"),
                 "another helper's hold": dict(helper_="Wabi"),
                 "a class whose switch is off": dict(cls="outward"),
                 "a class that doesn't exist": dict(cls="everything")}
        for what, kw in cases.items():
            nonce = self.token(**kw)
            self.assertNotEqual(pal(self.env, *self.args, "--tap", nonce).returncode, 0, what)
            self.assertFalse((self.dir / "run" / f"{nonce}.json").exists(), "used up either way")
        self.assertNotEqual(pal(self.env, *self.args, "--tap", "zz" * 16).returncode, 0)
        self.assertNotEqual(pal(self.env, *self.args, "--tap", "../" + "ab" * 15).returncode, 0)
        self.assertEqual(self.home()[0]["status"], "open")
        # Used once: the same token a second time is nothing.
        nonce = self.token()
        self.assertEqual(pal(self.env, *self.args, "--tap", nonce).returncode, 0)
        self.assertNotEqual(pal(self.env, *self.args, "--tap", nonce).returncode, 0)

    def test_presented_by_a_helper_or_beside_a_click(self):
        # Presented by a helper, a token is nothing: a run that says it's a helper is never an owner decision.
        self.assertNotEqual(helper(self.env, *self.args, "--tap", self.token()).returncode, 0)
        self.assertNotEqual(helper(self.env, "--as-helper", *self.args, "--tap", self.token(), name="").returncode, 0)
        self.assertEqual(self.home()[0]["status"], "open")
        # A click and a tap token together: the click is what counts, and it's the owner's.
        from test_desk import click
        r = pal(self.env, *self.args, "--click", click(self.data, self.args), "--tap", self.token())
        self.assertEqual(r.returncode, 0, r.stderr)
        x = self.home()[0]
        self.assertEqual((x["closed_by"], x.get("tapped")), (OWNER, None))


if __name__ == "__main__":
    unittest.main()
