# Pals Lite (T217): handoff

DeNon approved deleting the full pages on Home (h-724046, 2026-11-13). Plan:
`~/.config/herdr-app/data/crew-boards/pals-lite/plan.md`. Branch `crew/pals-lite`, off main 3f7ebd8,
worktree `crew-worktrees/project-pals-herdr-mod/pals-lite`. Not landed, not pushed, not installed.

## Done (commit by commit)

1. **80927d2** Board, Read, Computer: `mods/crew-palboard`, `crew-computer`, `crew-computer-app`,
   `bin/crewboard.py`, `bin/crewcomputer.py`, `pal computer`, `pal page`, Ctrl+Shift+Y/U, the
   palClick setting, crewd's "working" feed events. A pal click opens its terminal again.
   Task-due and feed tests moved to `tests/test_task_due.py`; the plugin-message test to
   `tests/test_messaging.py`.
2. **0c517a4** Profile panel (`mods/crew-profile`) and Routines dialog (`mods/crew-routines`).
   Proposals now review in a new dialog, `mods/crew-proposal` (`pal proposal show` returns
   `current` and `diff`; Accept passes `--text-sha`; both buttons are `ownerCli`). Change machine…
   moved to the pal menu. Hero buttons: Inbox, Tasks, Pop out, Close pal (Home on the head pal);
   the name opens the pal menu.
3. **8620488** Room page, composer, New room, the sidebar's Rooms section, the room menu, the Desk
   page's openers. Home shows MUSE's drafts (Send / Edit… / Discard, `ownerCli`); the header's
   button is Drop (quick-drop). The Desk settings dialog stays (About).
4. **f9cc4a9** Installer sets every deleted mod aside; `tests/test_lite.py` (nothing ships or
   points at a deleted page).
5. **b26157f** README, RECIPE, CHANGELOG.
6. **b040f6d** `mods/crew-desk` deleted (an earlier combined command was held by the gate as a
   Desk data write, a-4d41c0; that approval is stale and can be declined).

## Checked

All 22 Node test files; targeted Python (test_lite, test_proposal_review, test_task_due,
test_messaging, test_home, test_helpers, test_stage1, test_owner_step, test_taps*,
test_install_safety, test_profiles_safety); a fresh throwaway install (33 mods pass
`herdr-app check`); an upgrade over a fake older install (old mods backed up and set aside, two
modules removed, Ctrl+Shift+I/Y removed, a rebound Ctrl+Shift+U kept).

## Next

1. The full suite in Orca's heavy slot (1 GB cap, log in `~/.cache/pals-tests`).
2. A Codex review; focus: `mods/crew-proposal`, Home's draft actions, install.sh's keys.json edit.
3. Rebase onto main once Full control lands there (Orca's note), rerun targeted tests.
4. One Home ask to land and install. Not seen drawn in a window yet.

## Not done on purpose

The Chief and Factories (woven into the gate and crewd): a separate pass, per the plan.
