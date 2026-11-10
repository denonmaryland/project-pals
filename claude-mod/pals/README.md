# pals: Project Pals' Claude Code mod

Part of [Project Pals](../../README.md) (the Desk, docs/desk/design.md §6.3). It runs only in Claude Code
pals: Project Pals installs it to `~/.claude/project-pals/pals` and starts each Claude Code pal with
`--plugin-dir` pointing there, so your other Claude Code sessions never load it.

In a pal it hands over Desk cards without typing into the input box. While the pal works, a card is
added to its conversation, and the model reads it at its next step. When the pal is idle, a card
starts a turn of its own, and a half-typed draft in the box stays exactly as it was. It writes the
same `seen` receipts as the hooks. It also draws cards in the transcript, shows the topic's open cards
above the prompt, and adds `/desk`.

The work timeline (`hooks/timeline.tsx`) draws the pal's work as one calm line per tool call: icon,
verb, target and a short result (`▸ read src/a.ts 84 lines`, `✎ edit a.ts +3 −7`, `✓ test npm test
12 passed`). The engine's thinking summaries between calls become dim `◇ thinking` lines, and the
agent's prose stays as Claude Code draws it. An edit of 4 changed lines or fewer shows them under its
line. Click a line to open its raw output in place. ctrl+o
still shows Claude Code's own rows. Questions, plans and to-do lists keep their own rows. If
anything in it fails, Claude Code draws its normal rows. Set `PALS_TIMELINE=0` in a pal's
environment to turn it off.

Check it: `claude plugin validate claude-mod/pals` and `claude plugin test claude-mod/pals`.
