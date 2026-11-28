# macOS support: what would need to change

Status: **plan only, not built.** Project Pals is Linux-only today. This lists what blocks macOS,
based on a read of the code as of v0.2.0.

## Precondition

- **Herdr itself has to run on macOS**, both the app and `herdr-core` (`hc`). Project Pals is
  only a layout, mods and helpers on top of it. Confirm this first. If Herdr isn't on macOS,
  nothing below matters.

## What already works (probably)

- The mods (`mods/`, `lib/`) use only Herdr's API and POSIX `sh` (`ls`, `mkdir`, `mv`, `printf`,
  `tr`, `git`), so they should run unchanged.
- The Python (`bin/*.py`, `crewd`, `pal`) is standard library only, and `fcntl.flock` exists on macOS.
  Paths come from `Path.home()` and `HERDR_APP_HOME`. Check where Herdr keeps its home on macOS
  (`~/.config/herdr-app` or `~/Library/Application Support/...`).
- The updater checks downloads with Python's `hashlib`, not `sha256sum`.

## What has to change

### 1. The background helper (crewd): systemd → launchd (the main job)

`crewd` runs as `systemd/herdr-crew.service`. macOS needs a LaunchAgent instead:

- Add `launchd/dev.projectpals.crewd.plist` (`RunAtLoad`, `KeepAlive`, `ProgramArguments` →
  `~/.local/bin/crewd`, `StandardErrorPath` to a log in the data folder, an explicit
  `EnvironmentVariables.PATH` that includes `/opt/homebrew/bin` and `/usr/local/bin`).
- `install.sh`: on Darwin, install it to `~/Library/LaunchAgents/`, then
  `launchctl bootout gui/$UID/<label>` (ignore errors) followed by
  `launchctl bootstrap gui/$UID <plist>`. That replaces `daemon-reload` / `enable` / `restart`.
- Restarting crewd after an update happens in two places: `bin/crewupdate.py:140` and
  `bin/crew:673` (`systemctl --user try-restart`). Move both into one `restart_crewd()` in
  `crewlib.py` that picks `systemctl` or `launchctl kickstart -k gui/$UID/<label>`.
- `crewupdate.py:104` lists the unit file among the files it manages (for backup and rollback).
  Add the plist path on macOS.
- `mods/crew-roster/main.js:361` tells the user to run `systemctl --user start herdr-crew`.
  It should show the platform's command, or better a `pal daemon start` that hides the difference.

### 2. Opening links

- `mods/crew-about/main.js:145` uses `xdg-open`. Use `open` on macOS (or whatever Herdr's API
  offers for opening a URL, if it has one).

### 3. install.sh portability (it runs under macOS's bash 3.2 and BSD tools)

- `sed -i 's/…/…/' file` (line 51): BSD `sed` needs `sed -i ''`. Do the font swap in
  Python instead, which also handles the JSON properly.
- `readlink -e` (line 77) is GNU-only. Use `python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))'`
  or test the link with `[ -e "$link" ]`.
- `fc-list` (line 50) usually isn't on macOS. Check for the font with `system_profiler SPFontsDataType`
  or `ls ~/Library/Fonts /Library/Fonts`, or always fall back to Geist on macOS.
- `install -m` and `rsync -a --delete` both exist on macOS (rsync is an old 2.6.9 build, but the
  flags used are fine). Check the bash-isms against bash 3.2: `[[ ]]` and `${x%%:*}` are fine,
  and the script doesn't use associative arrays.
- `~/.local/bin` often isn't on `PATH` on macOS. Say so after installing (or offer to add it).

### 4. Release tooling (maintainer side, optional)

- `release` uses `sha256sum`. On macOS that's `shasum -a 256`. Only matters if releases get cut
  from a Mac.

### 5. Claude Code hooks and status line

- `install-hooks.py` writes `~/.claude/settings.json`, the same path on macOS. Nothing to change,
  but test that `crew-hook` and `crew-statusline` work under the Python that macOS puts on `PATH`
  (Xcode's `/usr/bin/python3` is 3.9. Check the code doesn't use newer syntax, such as
  `match` or `X | Y` type hints at runtime).

### 6. Sleep and wake: the terminal ownership checks ([#6](https://github.com/denonmaryland/project-pals/issues/6))

Reported on macOS in #6 (Project Pals 0.5.0, Herdr 0.1.16, herdr-core 0.1.21): `pal sleep` and
`pal wake` refuse every local topic with "can't find its shell on this machine". Nothing is
stopped or written to, so this is a safe refusal, not a crash.

- **Why:** before stopping an agent or typing into a shell, `crewlib.owns_terminal` and
  `crewsleep.names_terminal` prove the pid belongs to that terminal by finding
  `HC_TERMINAL_ID=<address>` in `/proc/<pid>/environ`. macOS has no `/proc`, so the read fails
  and both return False. `ps eww` and `sysctl KERN_PROCARGS2` don't show another process's
  environment there either.
- **What already falls back:** `proc_comm` and `child_pids` use `ps` and `pgrep` when `/proc` is
  missing. These two checks are the only ones with no fallback.
- **Proposed fix (not built yet):** the reporter suggested, and offered a PR for, a fallback used
  only when `/proc` doesn't exist: a pid counts as the terminal's shell when `hc get <address>`
  reports it as that terminal's `pid` *and* its parent (`ps -o ppid=`) is `herdr-core`.
  `names_terminal` would then walk up a few parents to that shell. If either check fails, the
  answer stays False. The Linux `/proc` path stays exactly as it is. Until that lands, sleep and
  wake don't work on macOS.
- **Related:** on macOS `proc_comm` reports Hermes as `python3` (`hermes` is a shell wrapper that
  execs Python), so `agent_children` doesn't recognise a running Hermes pal there.

### 7. Docs

- README: replace "Linux only" with a supported-platforms line, and add macOS install notes
  (Homebrew `rsync`/`python3` if needed, PATH).

## Suggested order

1. Confirm Herdr runs on macOS and where its home folder is.
2. Make `install.sh --no-helpers` work on macOS (section 3 and the link opener). That gives a
   usable layout with commands but no background queue.
3. Add the launchd helper and the shared `restart_crewd()` (section 1).
4. Run the throwaway-HOME install test from `AGENTS.md` on a Mac, then a real install.

## Rough size

Small to medium. Most of it is in `install.sh`, plus a plist and one shared restart function.
The risk is in launchd details (environment, PATH, logging) and anything Herdr does differently
on macOS, which can't be judged until step 1.
