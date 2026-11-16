// Project Pals header, drawn to the "MODE · Focus" board: the command bar's field centred (T18:
// the pal chip was redundant with the hero, so the centre is a recessed search field now, no pet in
// it; a click or Ctrl+Shift+Space opens crew-command over it, and the field shows a blue ring while
// it's open) and the split
// buttons on the right. The git branch isn't here: it's in the agent's own status line
// (crew-statusline; DeNon, 2026-11-08). No channel picker on the left: DeNon took it out on
// 2026-11-08 (channels switch from the hero's list; "no agent" shows there).
// Under it is the channel's terminal (terminal-first, DeNon 2026-11-08).
// keys.json / herdr-app do: crew-header.search opens the command bar from anywhere.
// crew-header.drop (Ctrl+Shift+D) opens the quick-drop, "Send to a pal" (no header button since
// 0.4.4: nothing in the app says Desk). The header is always shown, so it's the one place
// that reads the desk's counts (`pal desk ls --all --json`, when data/crew-desk changes, else every
// 10 s) and publishes them as shared("crew.desk") = { counts, pals, triage, at } for the other mods
// (pals: open / held per pal folder and topic, for the sidebar; triage: "auto" | "off"). It also
// toasts each new draft from the idea partner, once.
// Your call (T235): on the left, an amber "Your call · N" pill while anything waits on the owner
// (ownerCount: crew.needs, open Home asks and logins, drafts; red while a command is held). A click,
// crew-header.decide (Ctrl+Shift+A) and the toasts open crew-decide. The header toasts each new Home
// ask or login and each newly held command once (the ids already toasted are kept in localStorage).

import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, theme, focused, layout, nextCommand, shared, setShared, watchFolder, appHome, notify, readTextFile } from "herdr";
import {
  tone, ds, commandField, openCommandBar, splitButtons, FIELD_MAX, loadDesk, openDrop, keyHint, DESK_DIR, newDrafts, draftToast, needsYouCards,
  openDecide, ownerCount, needsTooltip, homeData, HOME_FILE, newIds, askToast, heldToast,
} from "./crew.js";

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
        // Ctrl+Shift+A, the toasts, the command bar: Your call. Opening it is all this does; it decides
        // only on a click or key in the dialog. ("drafts": an older draft toast's click.)
        if (c === "decide" || c === "drafts") openDecide();
        cx.notify();
      }
    });
    // The desk's counts: on every change under data/crew-desk, with a 10 s timer as the fallback
    // (and a minute's check even while the watch works).
    this.watching = false;
    this.lastDesk = 0;
    this.deskBusy = false;
    this.deskAgain = false;
    this.cards = [];
    this.asks = [];       // home.json's open asks and logins
    this.refreshDesk(cx);
    this.refreshAsks(cx);
    cx.timer.every(4000, (cx) => this.refreshAsks(cx));
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
        this.cards = cards;
        // The idea partner's new drafts: one toast each, once (the ids already toasted are kept in
        // this copy's localStorage, so a restart doesn't toast them again). Click: Your call.
        let seen = null;
        try { seen = JSON.parse(localStorage.getItem("drafts-seen") ?? "null"); } catch { seen = null; }
        const { fresh, seen: now0 } = newDrafts(cards, seen);
        for (const c of fresh) notify(draftToast(c));
        if (JSON.stringify(now0) !== JSON.stringify(seen)) localStorage.setItem("drafts-seen", JSON.stringify(now0));
        // Published only when something changed: the counts, any pal's or topic's (the sidebar's
        // Desk button and topic markers), or whether triage is on (the quick-drop's Auto).
        const was = shared("crew.desk");
        // needs: the cards waiting on the owner, for Your call and its pill.
        const now = { counts, pals, triage, needs: needsYouCards(cards) };
        if (JSON.stringify({ counts: was?.counts, pals: was?.pals, triage: was?.triage, needs: was?.needs }) !== JSON.stringify(now)) setShared("crew.desk", { ...now, at: this.lastDesk });
      } catch { /* no pal desk yet (an older install): no count */ }
      this.deskBusy = false;
      if (this.deskAgain) { this.deskAgain = false; this.refreshDesk(cx); }
      cx.notify();
    });
  }

  // Home's open asks and logins (for the pill), and a toast for each new one; a toast for each newly
  // held command too (crew.needs, published by the roster).
  refreshAsks(cx) {
    cx.spawn(async (cx) => {
      let items = this.asks;
      try { items = homeData(await readTextFile(`${appHome()}/${HOME_FILE}`)).items.filter((x) => x.status === "open" && (x.kind === "ask" || x.kind === "login")); } catch {}
      const toast = (key, list, make) => {
        let seen = null;
        try { seen = JSON.parse(localStorage.getItem(key) ?? "null"); } catch { seen = null; }
        const { fresh, seen: now } = newIds(list.map((x) => x.id), seen);
        for (const id of fresh) notify(make(list.find((x) => x.id === id)));
        if (JSON.stringify(now) !== JSON.stringify(seen)) try { localStorage.setItem(key, JSON.stringify(now)); } catch {}
      };
      toast("asks-seen", items, askToast);
      const held = (shared("crew.needs")?.items ?? []).filter((x) => x.why === "approval" && x.id);
      if (shared("crew.needs")) toast("held-seen", held, heldToast);
      if (JSON.stringify(items.map((x) => x.id)) !== JSON.stringify(this.asks.map((x) => x.id))) { this.asks = items; cx.notify(); }
    });
  }

  // The amber pill: what waits on you, in Your call. Hidden at zero.
  pill(d) {
    const needs = shared("crew.needs");
    const n = ownerCount(needs, this.asks, this.cards);
    if (!n) return div();
    const urgent = (needs?.approvals ?? 0) > 0 || (needs?.taps ?? 0) > 0;
    const color = urgent ? d.err : d.warnText;
    const why = [this.asks.length ? `${this.asks.length} ask${this.asks.length === 1 ? "" : "s"}` : null, needsTooltip(needs)].filter(Boolean).join(" · ");
    return h_flex().id("decide-pill").h(26).px(10).flex_none().items_center().gap(7).rounded(13).cursor_pointer()
      .bg(color + "1A").border_1().border_color(color + "55").hover((s) => s.bg(color + "2A"))
      .tooltip(`Your call (${keyHint("crew-header.decide") || "Ctrl+Shift+A"}): ${why}`)
      .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); openDecide(); })
      .child(div().size(6).flex_none().rounded(3).bg(color))
      .child(div().text_size(12).font_weight(600).text_color(color).child(`Your call · ${n > 99 ? "99+" : n}`));
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
    // "MODE · Focus": a 52 px bar on the chat background, 16 px in. No line under it (T97, DeNon
    // 2026-11-10: the hairline across the top went).
    const root = h_flex().id("crew-header").size_full().items_center().px(16).bg(d.bg0)
      .on_size_change((size, cx) => { if (size.width !== this.w) { this.w = size.width; cx.notify(); } })
      .on_mouse_move((e) => { if (e.local_position) this.origin = { x: e.position.x - e.local_position.x, y: e.position.y - e.local_position.y }; });

    return root
      // The left side, as wide as the right one so the field stays centred: Your call's pill.
      .child(h_flex().flex_1().flex_basis(0).min_w(0).items_center().child(this.pill(d)))
      .child(commandField(d, { w: this.fieldW(), onOpen: (e) => this.open(e) }))
      .child(h_flex().flex_1().flex_basis(0).min_w(0).justify_end().items_center().gap(8)
        .child(space && tab ? splitButtons(d) : div()));
  }
}
