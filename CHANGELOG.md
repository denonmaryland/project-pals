# Changelog

## 0.3.1 (not released yet)

- **Pick your working indicator.** Project Pals settings → Working indicator: the mark beside a
  working channel can be the classic dot or one of 30 small animations (pixel spinners, shaded
  spheres, ASCII globes), with live previews. A click applies it.
- **Pick how your pals are listed.** Project Pals settings → Pal list style: keep the big pets, or
  pick one of ten compact looks with smaller pets, so the full name, the project folder, the
  branch, the brain and channel and task counts fit (Name + folder, Two tight lines, Name wraps,
  Rich detail, Table, Tree with a working pal's live channels, Progress, Folder first, Grouped,
  Mini card). The dialog previews each one with your own pals; a click applies it.

## 0.3.0

A new look and a simpler shape. If you used the Pro view, Focus is now the only one.

- **Pocket pets.** Every pal is a little LED critter whose pose shows what it's doing: working,
  needs you, done, PR open, merged, closing or stuck. The Look dialog picks its species, colour,
  what it wears and its eyes. The old folder faces are gone.
- **Terminal-first.** A channel is its agent's terminal, with no card around it. Split it right or
  down from the header or by right-clicking. The chat view and the floating prompt card are gone:
  you answer an agent's questions in its terminal.
- **One layout.** Pro (the pal rail, tab strip and inspector) is gone; Focus is the layout.
  Ctrl+Shift+M no longer switches anything, and the installer removes that old binding only when it
  is exactly the one Project Pals added.
- **The sidebar.** The shown pal up top with its channels (pin them, reorder them, search them) and
  quick actions, then every pal with its state in colour. Pals go in folders you name, pin to the
  top, and drag into any order.
- **Tasks.** One Tasks button per pal: write a task (with screenshots pasted, dropped or attached)
  and the pal picks it up when its current turn ends. It replaces Tell.
- **Profiles.** A panel per pal with its mission, brain, memory, channels and tasks.
- **The Vault.** Each pal's notes as a vault: a Home note that writes itself as work lands (its
  mission and focus, the channels working now, its tasks, today's journal, the week's hiccups and
  lessons, the latest decisions and changes), with Mission, Journal and Brain beside it. Plain
  markdown on disk, so it opens in Obsidian too.
- **Dialogs** share one calm look, with the pal's pet in the header.
- **A settings gear** in the status bar: hire, rooms, routines, themes, layouts, Herdr settings and
  updates.
- **Updates you can see.** A quiet "Update available" pill in the status bar when a new release
  is out: click it for the highlights, then Update now (checked against the release's SHA256
  sums, with Roll back) or Later. The gear menu has Check for updates.
- **One-paste install.** The README's install command downloads the latest release, checks its
  SHA256 sums and runs the installer.
- **Start-up memory.** A pal always gets its pinned note, its main memory and what it knows about
  you, whole, then the newest notes.
- The git branch moved from the header into the agent's own status line.

### Fixed

- After picking an image with the paperclip, Enter adds the task again.
- Updating no longer fails when Herdr's folder is outside your home folder (HERDR_APP_HOME).
- The pal menu shows ~ for the home folder wherever it is.
- Tasks for pals whose names contain " - " counted toward them again.
- Pal and hero rows line up on one grid; long names no longer cut off.
