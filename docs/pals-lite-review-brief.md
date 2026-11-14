# Pals Lite (T217): brief for the Codex review

Review `crew/pals-lite` (against main 3f7ebd8) with the focus Orca set: the **owner actions** that
moved into new places when pages were deleted, and the installer's **keys.json edit**. The rest of
the branch is deletion; `tests/test_lite.py` checks that nothing ships or points at a deleted page.
Background: `docs/pals-lite-handoff.md`. Don't install, land or push; use throwaway homes and
`CREW_DATA`, and a 1 GB cap.

## 1. The proposal review dialog: `mods/crew-proposal/main.js`, `bin/crew` (proposal_current)

It replaces the deleted profile panel's review of a pal's proposed change to its mission or a
project's AGENTS.md. It opens from Home's View and the Inbox's View (`openProposal` in
`lib/crew.js`).

- Accept is `ownerCli(["proposal", "accept", id, "--text-sha", sha])` with the sha from
  `pal proposal show`, and Decline is `ownerCli(["proposal", "decline", id])`. Is the text DeNon sees
  exactly the text whose sha is sent? The diff is built from the current file in
  `proposal_current`. Can a proposal or the file change between show and Accept and still be
  accepted? `check_reviewed` and the mission `base` / `validate_apply` checks are meant to refuse
  that.
- Esc and × close without deciding; the footer's left button is Decline while the proposal is
  pending. Can anything decide without a click, or decide twice (the `busy` flag)?
- `proposal_current` reads `mission.md` or `<folder>/<file>`. Can `p["file"]` point outside the
  project folder? The file was validated when proposed (`crewagents`), but `show` reads it again.
  Is a bad or missing pal handled (it returns `{}`)?
- The diff is drawn as plain text lines. Anything rendered as markup?

## 2. Drafts on Home: `mods/crew-home/main.js` (~lines 320-330 and 700-712), `lib/crew.js` (draftTarget, editProps)

The Desk page was the only place to send the idea partner's drafts; Home lists them now (tray
`_drafts`, status `draft`).

- Send is `act(…, ["desk", "send-draft", id, "--to", draftTarget(c.to), "--json"])`, Discard is
  `["desk", "discard", id]`; `act` uses `ownerCli` (click token). Is that true on both paths, the
  card's buttons and the review's options (`owner(...)`)?
- Send goes where the draft suggests (`c.to`), with no picker as on the old Desk page. Can a draft
  suggest something it shouldn't (another owner tray, an unknown pal)? `send-draft` validates `--to`.
- Edit… opens the quick-drop prefilled (`editProps`, `fromDraft`), which sends as the owner's card
  and retires the draft. Same path as before.
- Is a draft ever counted as "needs you" or approved by the review keys (Enter takes a
  recommendation)? Drafts carry no recommendation.

## 3. keys.json: `install.sh` (the block after the key loop, "Keys for pages Pals Lite deleted")

- It removes `ctrl-shift-y`, `ctrl-shift-u` and `ctrl-shift-i` from `global` only when each still
  maps to our action (`crew-roster.computer`, `.board`, `.profile`). A rebound key stays (checked
  in a throwaway upgrade). It's skipped for a symlinked keys.json and backed up first, as the add
  loop is.
- Is the write atomic (tmp + `os.replace`)? What happens with a keys.json that isn't JSON, or a
  `global` that isn't an object? Does `--no-helpers` or a light install behave as before?
- The uninstaller's `INSTALL_KEYS` still lists the three pairs, so an uninstall also cleans them.

## Out of scope

The deletions themselves (covered by `tests/test_lite.py` and the Node tests), the docs, and the
Chief and Factories (not touched).
