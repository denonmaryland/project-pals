"""Standing helper grants at real CLI/queue/approval/lifecycle boundaries. Temporary homes only."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_helpers import Base, helper, frame
from test_desk import owner, pal, py, card, cid_of, queue, OWNER


class FullExecution(Base):
    def setUp(self):
        super().setUp()
        self.env['PAL_HELPER_PLAIN_KEYS'] = '1'
        self.level('full')

    def level(self, value):
        r = owner(self.env, self.data, 'settings', 'trust-helper', 'Pals', 'level', value)
        self.assertEqual(r.returncode, 0, r.stderr)

    def held(self, command='git push origin main', terminal='tW', extra=None):
        # The hook's folder (T205, card c-ddd208): a Full grant decides only requests whose execution
        # context the gate saved; one without it waits for the owner.
        return py(self.env, f'import crewguard; crewguard.HOOK_CWD = {str(self.root)!r}; '
                  f'print(json.dumps(crewguard.check({terminal!r}, "Worker", "general", {command!r}, extra={extra!r})))')

    def approval(self, rid):
        return json.loads((self.data / 'crew-approvals' / (rid + '.json')).read_text())

    def test_owner_only_home_answer_has_helper_provenance_and_no_click(self):
        asked = pal(self.env, 'home', 'ask', 'Ship this?', '--option', 'Yes', '--option', 'No', '--owner-only', term='tW')
        self.assertEqual(asked.returncode, 0, asked.stderr)
        iid = asked.stdout.split()[0]
        r = helper(self.env, 'home', 'answer', iid, 'Yes')
        self.assertEqual(r.returncode, 0, r.stderr)
        item = py(self.env, f'import crewhome; print(json.dumps(crewhome._find(crewhome.load(), {iid!r})))')
        self.assertEqual(item['delegated']['helper'], 'Pals')
        self.assertEqual(item['closed_by'], 'Pals acted under Full control')
        self.assertNotIn('[from ' + OWNER + ']', r.stdout)
        frames = [py(self.env, f'import crewlib; print(json.dumps(crewlib.item_text({q!r})))') for q in queue(self.data, 'tW')]
        self.assertTrue(any('Full control' in x for x in frames), frames)
        self.assertFalse(any('[from ' + OWNER + ']' in x for x in frames), frames)

    def test_outward_approval_runs_once_without_hold_and_revocation_expires_pending(self):
        first = self.held()
        r = helper(self.env, 'approve', first['id'])
        self.assertEqual(r.returncode, 0, r.stderr)
        approved = self.approval(first['id'])
        self.assertEqual(approved['delegated']['helper'], 'Pals')
        self.assertEqual(approved['decided_via'], 'Pals acted under Full control')
        self.assertIsNone(self.held())
        self.assertEqual(self.approval(first['id'])['status'], 'used')
        second = self.held()
        self.assertNotEqual(first['id'], second['id'])
        self.assertEqual(helper(self.env, 'approve', second['id']).returncode, 0)
        self.level('work')
        third = self.held()
        self.assertNotEqual(second['id'], third['id'])
        self.assertEqual(self.approval(second['id'])['status'], 'expired')
        self.assertFalse(py(self.env, f'import crewguard; print(json.dumps(crewguard.recently_used("tW", "push", '
                            f'words=["git", "push", "origin", "main"], cwd={str(self.root)!r})))'))

    def test_mutating_approved_request_invalidates_saved_authority(self):
        r = self.held(extra={'diff': 'reviewed patch'})
        self.assertEqual(helper(self.env, 'approve', r['id']).returncode, 0)
        p = self.data / 'crew-approvals' / (r['id'] + '.json')
        changed = json.loads(p.read_text()); changed['diff'] = 'different patch'; p.write_text(json.dumps(changed))
        again = self.held()
        self.assertNotEqual(r['id'], again['id'])
        self.assertEqual(self.approval(r['id'])['status'], 'expired')

    def test_compound_governance_operation_is_not_authorized_as_a_push(self):
        r = self.held('git push origin main; echo fake > data/crew-clicks/fake.json')
        result = helper(self.env, 'approve', r['id'])
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('trust or audit', result.stderr)
        self.assertEqual(self.approval(r['id'])['status'], 'pending')

    def test_a_click_word_after_the_separator_is_the_programs_not_a_token(self):
        """#codex-sol T212 round 7: Full authentication refused any argv holding --click / --tap, even
        a release's own notes after owner-step's --. Before the -- a token still gains no authority:
        the run falls back to no grant and the owner is asked (main's fail-closed dispatch)."""
        for opt in ('--click', '--tap'):
            with self.subTest(opt=opt):
                r = helper(self.env, 'owner-step', 'release-script', '--', './release', '9.9.9', 'notes', opt, 'word')
                self.assertEqual(r.returncode, 0, r.stderr)
                self.assertFalse(list((self.data / 'crew-approvals').glob('*.json')))
                r = helper(self.env, 'owner-step', 'release-script', opt, 'ab' * 16, '--', './release', '9.9.9', 'notes')
                self.assertEqual(r.returncode, 3, r.stderr)
                held = [json.loads(f.read_text()) for f in (self.data / 'crew-approvals').glob('*.json')]
                self.assertEqual([(h['status'], h.get('delegated')) for h in held], [('pending', None)])
                for f in (self.data / 'crew-approvals').glob('*.json'):
                    f.unlink()

    def test_owner_step_uses_full_grant_but_work_and_governance_do_not(self):
        r = helper(self.env, 'owner-step', 'release-script', '--', './release', '9.9.9', 'example')
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertFalse(list((self.data / 'crew-approvals').glob('*.json')))
        denied = helper(self.env, 'owner-step', 'release-script', '--', 'echo fake > data/crew-clicks/fake.json')
        self.assertNotEqual(denied.returncode, 0)
        self.level('work')
        self.assertNotEqual(helper(self.env, 'owner-step', 'release-script', '--', './release', '9.9.9', 'example').returncode, 0)

    def test_full_card_is_stamped_and_revoked_queued_work_is_cancelled(self):
        r = helper(self.env, 'tell', 'Worker', 'Proceed with this work')
        self.assertEqual(r.returncode, 0, r.stderr)
        cid = cid_of(r.stdout)
        c = card(self.env, cid)
        self.assertEqual(c['delegated']['helper'], 'Pals')
        self.assertIn('[from Pals, acting under Full control]', frame(self.env, cid))
        self.level('off')
        output = py(self.env, f'import crewdesk; print(json.dumps(crewdesk.frame_for({dict(card=cid, text="do stale work")!r})))')
        self.assertIn('Cancelled', output)
        self.assertNotIn('do stale work', output)
        self.assertEqual(card(self.env, cid)['status'], 'cancelled')

    def test_draft_sent_under_full_is_helpers_not_owners(self):
        cid = py(self.env, 'import crewdesk; print(json.dumps(crewdesk.draft("Helper#build", "terminal tH", "Worker#general", "Useful work", "Details")["id"]))')
        r = helper(self.env, 'desk', 'send-draft', cid)
        self.assertEqual(r.returncode, 0, r.stderr)
        c = card(self.env, cid)
        self.assertEqual(c['from_kind'], 'helper')
        self.assertEqual(c['from'], 'Pals')
        self.assertTrue(c['helper_verified'])
        self.assertFalse(c['verified'])
        self.assertEqual(c['drafted_by'], 'Helper#build')

    def test_delegated_metadata_cannot_be_added_or_changed_by_hand(self):
        r = helper(self.env, 'tell', 'Worker', 'Original')
        cid = cid_of(r.stdout)
        result = py(self.env, f'''import crewdesk
c = crewdesk.read(crewdesk.need({cid!r}))
before = crewdesk.helper_verified(c)
c['delegated']['grant'] = 'invented'
print(json.dumps([before, crewdesk.helper_verified(c)]))''')
        self.assertEqual(result, [True, False])

    def test_full_uninstall_revokes_grants_and_preserves_receipt_on_purge(self):
        # Keep the helper store and uninstaller rooted in the SAME throwaway app.
        env = {**self.env, 'HERDR_APP_HOME': str(self.root)}
        before = helper(env, 'home', 'note', 'Previously completed operation')
        self.assertEqual(before.returncode, 0, before.stderr)
        audit_before = (self.data / 'crew-helpers/log.jsonl').read_text().splitlines()
        self.assertTrue(any(json.loads(x).get('status') == 'done' for x in audit_before))
        r = helper(env, 'uninstall', '--purge', '--json')
        self.assertEqual(r.returncode, 0, r.stderr)
        receipts = self.data / 'owner-action-receipts.jsonl'
        self.assertTrue(receipts.exists())
        rows = [json.loads(x) for x in receipts.read_text().splitlines()]
        self.assertEqual([x['status'] for x in rows], ['started', 'done'])
        self.assertEqual(rows[-1]['helper'], 'Pals')
        archived = (self.data / 'owner-helper-audit.jsonl').read_text().splitlines()
        self.assertTrue(set(audit_before).issubset(set(archived)), 'purge must preserve all existing helper audit entries')
        self.assertFalse((self.data / 'crew-helpers').exists(), 'generic completion logging must not recreate purged state')
        self.assertFalse((Path(self.env['HOME']) / '.config/project-pals/helpers/pals.key').exists())

    def test_helper_cannot_approve_erasing_preserved_audit(self):
        for target in ('owner-helper-audit.jsonl', 'owner-action-receipts.jsonl'):
            with self.subTest(target=target):
                held = self.held('git push origin main; echo erased > data/' + target)
                r = helper(self.env, 'approve', held['id'])
                self.assertNotEqual(r.returncode, 0)
                self.assertIn('trust or audit', r.stderr)
                self.assertEqual(self.approval(held['id'])['status'], 'pending')
