# Full control for your helpers

Choose **About → Settings → Trusted helpers**, then choose a level for each assistant:

| Level | What it can do |
|---|---|
| Off | No trusted helper authority. |
| Work only | Send normal work, questions and tasks to your pals. Owner decisions still need approval. |
| Full control | Make app decisions autonomously, including Home answers, settings, missions, AGENTS.md, proposals, installs, uninstall, landing, pushes, releases and messaging people. |

Full control has no per-action confirmation or hold period. Choose it for a helper you want to
act for you, including when you are away. Only your actual click in the app sets helper trust
or changes keys. A helper cannot promote itself or another helper, forge a click, or rewrite
trust/audit evidence. New helpers are added at Work only; old on helpers remain Work only.
No migration or old tap setting enables Full control.

## Using the grant

The helper authenticates with its own key from outside a pal's terminal. For example:

```sh
PAL_HELPER=Pals pal helpers check
PAL_HELPER=Pals pal tell "Orca#ops" "Please prepare the next build"
PAL_HELPER=Pals pal home answer h-123456 "Proceed"
```

`pal --as-helper=Pals …` is another way to select that helper. Ordinary command requirements
still apply, including matching review hashes and clean merges. The helper can approve a pal's
exact held command with `pal approve ID`; that approval is used once and checked against the
current grant when consumed. A message requesting a release does not itself clear a held
release command. Pals must not read or use a helper's key to carry out its requests.

Work only cards say “from you via Pals, a trusted helper: normal work only”. Authenticated Full
cards say **[from Pals, acting under Full control]**. The helper acts under your standing grant;
it does not impersonate your own click.

## Checking activity and revoking

**Home → Helper activity** says **Pals acted under Full control**, with the operation and its
outcome. Full Home answers name the helper. An operation may be started, done or failed; if it
remains started after an interruption, inspect what happened before retrying. `pal helpers log`
also shows activity. The log does not contain the helper's key.

Click **Revoke** on Home or choose **Off** in Trusted helpers. A downgrade, key rotation or
removal also invalidates the previous grant. Queued operations and unused approvals must still
match a current grant when used. Revocation stops future use; it cannot undo a completed push,
release, write or message, or recall work already started from delivered instructions.

## Moving from relayed taps

The three tap switches and delay settings are retired. No new tap tickets or execution tokens
authorize work. Old queued holds are cancelled; existing history stays visible. Historical
Home-answer Undo reopens the question and tells its asker, but cannot undo work already done.
Choose Work only or Full control yourself in the app.

These are application permissions and records, not OS isolation. Pals and other programs may
run as the same computer user; the guards are designed to prevent mistakes and confused
attribution, not contain a determined process with that user's filesystem access.
