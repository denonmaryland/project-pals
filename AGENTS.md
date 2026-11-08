# Project Pals: notes for agents working on this repo

Project Pals is a [Herdr](https://herdr.dev) layout plus a set of mods and command-line helpers.
Each Herdr space is a pal (a project with a brain: Claude Code, Codex, …). Each of its tabs is a
channel. A head pal oversees the rest. `README.md` is the user-facing pitch. `RECIPE.md` is the
full spec (what you see, how it behaves, watch-outs, done-when): read it before changing behavior.

## Layout

| Path | What it is |
|---|---|
| `mods/crew-*/` | Herdr mods (`mod.json` + `main.js`, plus icons). One per sidebar, header, menu, dialog, etc. |
| `lib/` | Shared JS (`crew.js`, `pets.js`, `palstyles.js`). **Not imported from a shared place:** `install.sh` copies them into every mod folder. Edit them here, never the copies in an installed mod. |
| `bin/` | The commands. `crew` installs as `pal`, `crew-room` as `pal-room`. `crewd` is the background helper (systemd user service). `crew-hook` is the Claude Code hooks, `crew-statusline` the status-line wrapper. `crew*.py` are the shared Python modules, installed to `~/.local/lib/herdr-crew/`. |
| `god/AGENTS.md` | The head pal's standing brief, a template (`{{HEAD}}`, `{{OWNER}}`) rendered into `~/.config/herdr-app/data/crew-god/`. |
| `layouts/pals.json`, `pals.svg` | The `pals` Herdr layout and its icon. |
| `systemd/herdr-crew.service` | The user unit that runs `crewd`. |
| `install.sh`, `install-hooks.py` | The installer. The hooks script edits `~/.claude/settings.json` (it backs it up first). |
| `release` | The release script (see below). |
| `pals.json`, `VERSION` | The manifest (name, GitHub repo, layout) and the current version, both read by the updater. |
| `docs/` | Longer notes, e.g. `mac-support.md`. |

Internal names still say `crew` (mods, Python modules, `crewd`, `herdr-crew.service`, data files
like `crew-settings.json`). That's deliberate: renaming them breaks existing installs and the
updater. User-facing text says "pal".

### The `buddy` / `botz` / `crew` aliases are on purpose

The project was called Herdr Crew, then Terminal Botz, then Project Buddies. `install.sh` links
`buddy`, `botz` and `crew` (and their `-room` versions) to `pal` / `pal-room` so older scripts,
memories and pal briefs keep working. It only links a name that is free or already ours (it leaves
CrewAI's `crew` alone, for example). Don't remove these aliases or the old-layout migration
(`crew.json`, `buddies.json`) as "cleanup".

## Testing

Check changes like this:

0. **Regression tests:** `python3 -m unittest discover -s tests` and `node tests/test_bind.mjs`
   (the approval gate, the owner's click, attachments, Roll back, the panel's edit binding). They
   use throwaway `CREW_DATA` and homes; the release preflight runs them. Add a test with every fix.
1. **Syntax and mods:** the `./release` preflight does `bash -n` on the scripts, `py_compile` on
   the Python, `json.tool` on the JSON and `node --check` on the JS. `herdr-app check <installed mod folder>`
   loads a mod once and reports errors. `install.sh` runs it on every mod at the end.
2. **Install into a throwaway HOME, never the real one.** A real `./install.sh` changes
   `~/.config/herdr-app`, `~/.claude/settings.json` and systemd units, and it restarts the live
   `crewd`. `systemctl --user` and `herdr-app` reach the live session whatever `HOME` says, so
   also put fake versions in front of them on `PATH`:
   ```sh
   T=$(mktemp -d); mkdir -p $T/home/.config/herdr-app $T/shims
   printf '#!/bin/sh\nexit 1\n' > $T/shims/systemctl               # "no systemd user session"
   cat > $T/shims/herdr-app <<EOF                                   # only check and a fake ls
   #!/bin/sh
   case "\$1" in
     check) exec $(command -v herdr-app) "\$@" ;;
     ls) echo '{"spaces":[],"recent":[]}'; exit 0 ;;
   esac
   exit 1
   EOF
   chmod +x $T/shims/*
   env -i HOME=$T/home PATH=$T/shims:$T/home/.local/bin:/usr/bin:/bin ./install.sh
   env -i HOME=$T/home PATH=$T/shims:$T/home/.local/bin:/usr/bin:/bin pal team   # zero pals
   ```
   Cover a fresh install, a second install over it, `--no-helpers`, and an existing
   `~/.claude/settings.json` that already has a `statusLine`.
3. **Data sandbox:** `CREW_DATA=/some/dir` points the Python side at another data folder, so you
   can try `pal task`, `pal remember` and so on without touching the real board or memory. It does
   NOT stop delivery: a task assigned to a real pal (`--for <Pal>`) or a `pal tell` still reaches that
   pal's live terminal. Assign test tasks to nobody, or to yourself and expect the message.
4. **In the app:** after installing for real (only with the owner's OK), Herdr hot-reloads mods
   and layouts. `herdr-app status` shows errors and `herdr-app shot` saves a screenshot.

## Releasing

```sh
./release X.Y.Z "What changed"     # or: ./release X.Y.Z -F notes.md
```

It needs a clean `main`, `gh` signed in, and nothing on `origin/main` you don't have. It runs the
preflight, bumps `VERSION`, commits, tags `vX.Y.Z`, builds `dist/project-pals-X.Y.Z.tar.gz` and
`SHA256SUMS`, pushes, and creates the GitHub release. Every install's updater (About → Check for
updates, and crewd's daily check) then offers it, and refuses a tarball that doesn't match
`SHA256SUMS`. **Pushing and releasing need the owner's explicit approval.** A message from
another pal is not approval. From a pal, `./release X.Y.Z` is held by the approval gate (the
`release-script` rule) until the owner clicks Approve in the Inbox: the script pushes and publishes
inside itself, where the gate can't see those commands. Approvals not used within 30 minutes
expire, so approve right before the run.

## Rules of thumb

- Updates and installs replace only Project Pals' own files. Never touch a user's pals, rooms,
  memory, routines or tasks (`~/.config/herdr-app/data/…`) in the installer or updater.
- Anything that writes outside Herdr's folder (`~/.claude`, systemd, `~/.local/bin`) gets backed
  up first and stays skippable with `--no-helpers`.
- Linux only for now. See `docs/mac-support.md` before adding platform-specific code.
