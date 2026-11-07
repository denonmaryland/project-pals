// Project Pals header, drawn to the "MODE · Focus" board: the command bar's field centred (T18:
// the pal chip was redundant with the hero, so the centre is a recessed search field now, no pet in
// it; a click or Ctrl+Shift+Space opens crew-command over it, and the field shows a blue ring while
// it's open) and the split
// buttons on the right. The git branch isn't here: it's in the agent's own status line
// (crew-statusline; DeNon, 2026-11-08). No channel picker on the left: DeNon took it out on
// 2026-11-08 (channels switch from the hero's list; "no agent" shows there). In a room: the room's
// members. Under it is the channel's terminal (terminal-first, DeNon 2026-11-08).
// keys.json / herdr-app do: crew-header.search opens the command bar from anywhere.
// The Desk (design §11.1): a "Desk N" button on the right (open cards; amber while any are held)
// toggles the Desk view, the center stack's desk-view. crew-header.drop (Ctrl+Shift+D) opens the
// quick-drop composer, crew-header.desk the view. The header is always shown, so it's the one place
// that reads the desk's counts (`pal desk ls --all --json`, when data/crew-desk changes, else every
// 10 s) and publishes them as shared("crew.desk") = { counts, pals, triage, at } for the other mods
// (pals: open / held per pal folder and topic, for the sidebar; triage: "auto" | "off"). It also
// toasts each new draft from the idea partner, once; crew-header.drafts (the toast's click) opens
// the Desk on Drafts.

import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, theme, focused, layout, nextCommand, shared, setShared, watchFolder, appHome, notify } from "herdr";
import { shownRoom, roomMembers, mascotEl, mood, tone, ds, commandField, openCommandBar, splitButtons, FIELD_MAX,
  loadDesk, deskMode, showDesk, showTabs, openDrop, keyHint, DESK_DIR, newDrafts, draftToast, homeMode, needsYouCards } from "./crew.js";

const SIDE = 160;        // the Desk button and the split buttons, kept clear on both sides so the field stays centred
const FIELD_Y = 11;      // (52 - 30) / 2

const findNode = (n, id) => { if (n?.id === id) return n; for (const c of n?.children ?? []) { const f = findNode(c, id); if (f) return f; } return null; };

export default class CrewHeader extends View {
  init(_props, cx) {
    this.w = 0;           // the header's width (on_size_change)
    this.origin = null;   // its window position, once the pointer has crossed it
    // Shared values persist: a quit with the command bar open would leave the field's ring on.
    if (shared("crew.command.open")) setShared("crew.command.open", false);
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        if (c === "search") this.open(null);
        if (c === "drop") openDrop();
        if (c === "desk") this.toggleDesk();
        if (c === "drafts") showDesk("drafts");   // the draft toast's click
        cx.notify();
      }
    });
    // The desk's counts: on every change under data/crew-desk, with a 10 s timer as the fallback
    // (and a minute's check even while the watch works).
    this.watching = false;
    this.lastDesk = 0;
    this.deskBusy = false;
    this.deskAgain = false;
    this.refreshDesk(cx);
    cx.timer.every(10000, (cx) => { if (!this.watching || Date.now() - this.lastDesk > 60000) this.refreshDesk(cx); });
    cx.spawn(async (cx) => {
      for (;;) {
        try { await watchFolder(`${appHome()}/${DESK_DIR}`); this.watching = true; }
        catch { this.watching = false; return; }   // no desk folder yet (or too big): the timer carries on
        this.refreshDesk(cx);
      }
    });
  }

  refreshDesk(cx) {
    if (this.deskBusy) { this.deskAgain = true; return; }
    this.deskBusy = true;
    cx.spawn(async (cx) => {
      try {
        const { cards, counts, pals, triage } = await loadDesk();
        this.lastDesk = Date.now();
        // The idea partner's new drafts: one toast each, once (the ids already toasted are kept in
        // this copy's localStorage, so a restart doesn't toast them again). Click: the Desk on Drafts.
        let seen = null;
        try { seen = JSON.parse(localStorage.getItem("drafts-seen") ?? "null"); } catch { seen = null; }
        const { fresh, seen: now0 } = newDrafts(cards, seen);
        for (const c of fresh) notify(draftToast(c));
        if (JSON.stringify(now0) !== JSON.stringify(seen)) localStorage.setItem("drafts-seen", JSON.stringify(now0));
        // Published only when something changed: the counts, any pal's or topic's (the sidebar's
        // Desk button and topic markers), or whether triage is on (the quick-drop's Auto).
        const was = shared("crew.desk");
        // needs: the cards waiting on the owner, for the Inbox and the status bar's count.
        const now = { counts, pals, triage, needs: needsYouCards(cards) };
        if (JSON.stringify({ counts: was?.counts, pals: was?.pals, triage: was?.triage, needs: was?.needs }) !== JSON.stringify(now)) setShared("crew.desk", { ...now, at: this.lastDesk });
      } catch { /* no pal desk yet (an older install): no count */ }
      this.deskBusy = false;
      if (this.deskAgain) { this.deskAgain = false; this.refreshDesk(cx); }
      cx.notify();
    });
  }

  toggleDesk() { if (deskMode()) showTabs(); else showDesk(); }

  deskButton(d) {
    const c = shared("crew.desk")?.counts ?? {};
    const open = c.open ?? 0, held = c.held ?? 0;
    const on = deskMode();
    const hint = keyHint("crew-header.drop");
    return div().id("desk-btn").h(26).flex().flex_none().items_center().gap(6).px(8).rounded(d.r.sm).cursor_pointer()
      .bg(on ? d.sel : "#00000000").border_1().border_color(on ? d.lineMid : "#00000000").hover((s) => s.bg(d.hover))
      .tooltip(`The Desk: every pal's cards${held ? ` · ${held} held` : ""}${hint ? ` · ${hint} drops a card` : ""}`)
      .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); this.toggleDesk(); cx.notify(); })
      .child(svg("mods/crew-roster/icons/ds-tell.svg").size(13).text_color(held ? d.warnText : on ? d.fg1 : d.fg2))
      .child(div().text_size(12).font_weight(500).text_color(on ? d.fg1 : d.fg2).child("Desk"))
      .when(open > 0, (el) => el.child(div().px(5).h(16).flex().items_center().rounded(3)
        .bg(held ? "#E8AA0A29" : d.raised).border_1().border_color(held ? "#E8AA0A47" : d.line)
        .text_size(11).font_family(d.mono).text_color(held ? d.warnText : d.fg2).child(String(open))));
  }

  fieldW() { return Math.max(200, Math.min(FIELD_MAX, this.w - 2 * (SIDE + 16))); }

  // Where the field is in the window: from a press on it, else from the header's last known
  // position (the pointer crossing it), else from the layout (the header starts after the sidebar).
  fieldAt(e) {
    const w = this.fieldW();
    if (e?.local_position) return { x: e.position.x - e.local_position.x, y: e.position.y - e.local_position.y, w };
    const side = findNode(layout(), "sidebar");
    const x0 = this.origin?.x ?? (side && !side.hidden ? side.size?.px ?? 0 : 0);
    const y0 = this.origin?.y ?? 0;
    return { x: x0 + (this.w - w) / 2, y: y0 + FIELD_Y, w };
  }

  open(e) {
    const all = spaces();
    const space = all.find((s) => s.active) ?? all.find((s) => s.id === focused()?.space);
    openCommandBar(space?.id ?? null, this.w ? this.fieldAt(e) : null);
  }

  render() {
    const t = tone(theme());
    const d = ds(t);
    const all = spaces();
    const space = all.find((s) => s.active) ?? all.find((s) => s.id === focused()?.space);
    const tab = space?.tabs.find((x) => x.active);
    // "MODE · Focus": a 52 px bar on the chat background, a #18181A hairline under it, 16 px in.
    const root = h_flex().id("crew-header").size_full().items_center().px(16).bg(d.bg0).border_b_1().border_color(d.lineSoft)
      .on_size_change((size, cx) => { if (size.width !== this.w) { this.w = size.width; cx.notify(); } })
      .on_mouse_move((e) => { if (e.local_position) this.origin = { x: e.position.x - e.local_position.x, y: e.position.y - e.local_position.y }; });

    const room = shownRoom();
    if (room) {
      // A room: its members' pets overlapping and the room's name, centred, in the chip's style.
      const members = roomMembers(room);
      const faces = h_flex().children(members.slice(0, 5).map((m, i) => div().when(i > 0, (el) => el.ml(-7))
        .child(mascotEl(m.bot, mood(m.status, m.agent), 28, t))));
      return root.justify_center()
        .child(h_flex().id("room-pill").h(30).items_center().gap(8).pl(4).pr(10).rounded(d.r.sm).bg(d.raised).border_1().border_color(d.lineMid)
          .child(faces)
          .child(div().text_size(13).font_weight(600).text_color(d.fg1).child(`#${room.name}`)));
    }
    return root
      // An empty left side as wide as the right one, so the field stays centred.
      .child(h_flex().flex_1().flex_basis(0).min_w(0))
      .child(commandField(d, { w: this.fieldW(), onOpen: (e) => this.open(e) }))
      .child(h_flex().flex_1().flex_basis(0).min_w(0).justify_end().items_center().gap(8)
        .child(this.deskButton(d))
        .child(space && tab && !deskMode() && !homeMode() ? splitButtons(d) : div()));
  }
}
