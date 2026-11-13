# Contributing to Project Pals

First-run reports are especially welcome. Project Pals is early, Linux-only software for
Herdr 0.1.8+ and herdr-core 0.1.11+, both below 0.2. See the README's
[quick start](README.md#try-it-in-10-minutes) and [harness coverage](README.md#harnesses).

## Report a problem or a working harness

Search [existing issues](https://github.com/denonmaryland/project-pals/issues) first, then
[choose a report](https://github.com/denonmaryland/project-pals/issues/new/choose):

- **Bug report:** a feature behaved unexpectedly after installation.
- **Install problem:** install, update, rollback or uninstall got stuck.
- **Harness report:** a harness worked, partly worked, or failed; successful reports count too.

One problem per issue. A short numbered reproduction with expected and actual behavior is
more useful than a whole log. Include the install method and any relevant flags.
Run `pal report` and paste its output after reviewing it. It uploads nothing and emits
fixed metadata/error categories, never raw log messages. Missing tools and journal access
are fine; the report marks unavailable information. From a source folder you can also run
`python3 bin/crew report`, even if install failed. Older releases without this command can
be reported with manually entered Project Pals, Herdr and hc versions.

Issues are public. Don't attach your data folder, session transcripts, environment dumps,
credentials, private source, or a whole system journal. If a short error excerpt or screenshot
helps, remove private paths, project/pal names, account details and secrets first. For a possible
security issue, use GitHub's private vulnerability reporting **if enabled** on the repository's
Security tab; otherwise open an issue asking for a private contact without exploit details or secrets.

## Send a code change

Read [AGENTS.md](AGENTS.md) and [RECIPE.md](RECIPE.md) before changing behavior. Work on a
branch; explain the problem, resulting behavior, and checks in your PR. Add a regression test
for fixes. Edit shared JS in `lib/`, not installed copies. Keep internal `crew` names and legacy
command aliases intact.

Run `python3 -m unittest discover -s tests` and each `tests/*.mjs` with Node (one at a time).
Tests use temporary data and fake programs. For installer checks, follow AGENTS.md's throwaway
HOME **and command shims** instructions; changing HOME alone doesn't isolate Herdr or systemd.
Never run the installer on your everyday setup just to test a contribution. Don't run `release`
as a test: it pushes and publishes. UI changes also need a checked mod and a visual check in an
isolated Herdr instance. Say plainly what you couldn't test.
