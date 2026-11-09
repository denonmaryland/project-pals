# pals: Project Pals' Claude Code mod

Part of [Project Pals](../../README.md) (the Desk, docs/desk/design.md §6.3). It runs only in Claude Code
pals: Project Pals installs it to `~/.claude/project-pals/pals` and starts each Claude Code pal with
`--plugin-dir` pointing there, so your other Claude Code sessions never load it.

In a pal it hands over Desk cards without typing into the input box. While the pal works, a card is
added to its conversation, and the model reads it at its next step. When the pal is idle, a card
starts a turn of its own, and a half-typed draft in the box stays exactly as it was. It writes the
same `seen` receipts as the hooks. It also draws cards in the transcript, shows the topic's open cards
above the prompt, and adds `/desk`.

Check it: `claude plugin validate claude-mod/pals` and `claude plugin test claude-mod/pals`.
