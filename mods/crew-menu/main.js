// Project Pals menu: what a right-click offers, as a small popup at the pointer.
// - A tab: pin it, review its branch (a worktree channel), color it (from the theme's own colors, so it follows the theme), rename, close.
// - A pal: its profile (the right-side panel), pin it to the top, rename it (its memory and routines follow the name), change its look,
//   add a channel, put it to sleep.
// - A sleeping pal: wake it, unpin it, or forget it (its memory folder stays on disk).
// - A room: open it, or close it (its transcript is kept).
// - A chat message: copy it, or one of its code blocks.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, props, closeOverlay, openOverlay, spaces, run } from "herdr";
import {
  botOf, updateBot, channelName, renameChannel, a, TAB_COLORS, tabPinned, pinTab, tabColorKey, colorTab, palPinned, pinPal, tone,
  canMoveChannel, moveChannel, canMovePal, movePal, palGroups, groupOf, setPalGroup, moveGroup, deleteGroup,
  crew, wakePal, forgetPal, rememberModel, rooms, showRoom, deleteRoom, showTabs, togglePanel, worktreeOf, openReview } from "./crew.js";

const ICON = "mods/crew-roster/icons";

export default class CrewMenu extends View {
  close() { closeOverlay(props()?.overlay); }

  render() {
    const t = tone(theme());
    const p = props() ?? {};
    const space = spaces().find((s) => s.id === p.space);
    const root = v_flex().id("crew-menu").w_full().p(6).gap(1).text_color(t.foreground);

    const item = (id, icon, label, action, color = t.foreground) => h_flex().id(id).h(32).px(10).gap(10).items_center().rounded(8).cursor_pointer()
      .hover((s) => s.bg(a(t.foreground, "0c")))
      .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); action(cx); this.close(); })
      .child(div().w(16).flex_none().flex().justify_center().when(Boolean(icon), (el) => el.child(svg(`${ICON}/${icon}.svg`).size(14).text_color(color === t.foreground ? t.dim : color))))
      .child(div().text_size(13).text_color(color).child(label));
    // Move up / Move down side by side in one row (Herdr has no row dragging); a direction that
    // can't move (an end, or the edge of the pinned group) is dimmed and does nothing.
    const moves = (id, can, act) => h_flex().h(32).gap(2)
      .children([[-1, "arrow-up", "Move up"], [1, "arrow-down", "Move down"]].map(([dir, icon, label]) => {
        const ok = can(dir);
        return h_flex().id(`${id}-${dir < 0 ? "up" : "down"}`).flex_1().h(32).px(10).gap(8).items_center().rounded(8)
          .when(ok, (el) => el.cursor_pointer().hover((s) => s.bg(a(t.foreground, "0c")))
            .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); act(dir); this.close(); }))
          .child(svg(`${ICON}/${icon}.svg`).size(13).flex_none().text_color(ok ? t.dim : a(t.foreground, "30")))
          .child(div().text_size(13).text_color(ok ? t.foreground : a(t.foreground, "40")).child(label));
      }));
    const title = (text) => div().px(10).pt(6).pb(6).truncate().text_size(12).text_color(t.dim).child(text);
    const line = () => div().mx(6).my(4).h(1).bg(a(t.foreground, "10"));
    // Something that can't be undone from here: red icon, readable label, and a second click that
    // says what it'll do before it does it.
    const careful = (id, label, armed, run) => h_flex().id(id).h(32).px(10).gap(10).items_center().rounded(8).cursor_pointer()
      .hover((s) => s.bg(a(t.blocked, "18")))
      .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); if (armed && !this.armed) { this.armed = true; cx.notify(); return; } run(cx); })
      .child(div().w(16).flex_none().flex().justify_center().child(svg(`${ICON}/x.svg`).size(14).text_color(t.blocked)))
      .child(div().text_size(13).text_color(this.armed && armed ? t.blocked : t.foreground).child(this.armed && armed ? armed : label));


    // A sleeping pal (no space): wake, unpin, forget.
    if (p.what === "sleeper") {
      const rec = crew().bots.find((b) => b.id === p.rec);
      if (!rec) return root.child(div().p(8).text_size(13).text_color(t.dim).child("That pal is gone."));
      const pinned = palPinned(rec);
      return root
        .child(title(`${rec.name} · asleep`))
        .child(item("m-wake", null, "Wake", () => wakePal(rec)))
        .when(pinned, (el) => el.child(item("m-pin", "pin", "Unpin from the top", () => pinPal(rec, false))))
        .child(line())
        .child(careful("m-forget", "Forget this pal", "Click again to forget", () => { forgetPal(rec); this.close(); }));
    }

    // A room: open it, or close it (Project Pals keeps its transcript).
    if (p.what === "room") {
      const room = rooms().find((r) => r.id === p.room);
      if (!room) return root.child(div().p(8).text_size(13).text_color(t.dim).child("That room is gone."));
      return root
        .child(title(`#${room.name}`))
        .child(item("m-open", null, "Open", () => showRoom(room.id)))
        .child(line())
        .child(careful("m-close-room", "Close room", "Click again to close it", () => { deleteRoom(room.id); showTabs(); this.close(); }));
    }

    if (!space) return root.child(div().p(8).text_size(13).text_color(t.dim).child("That's gone."));

    if (p.what === "tab") {
      const tab = space.tabs.find((x) => x.id === p.tab);
      if (!tab) return root.child(div().p(8).text_size(13).text_color(t.dim).child("That channel is gone."));
      const pinned = tabPinned(tab);
      const current = tabColorKey(tab);
      // A row of the theme's colors; the first clears it. The one in use has a ring.
      const swatch = (key) => {
        const on = (current ?? null) === key;
        const fill = key ? t[key] : null;
        return div().id(`sw-${key ?? "none"}`).size(22).flex_none().rounded(4).p(2).cursor_pointer()
          .border_2().border_color(on ? t.foreground : "#00000000")
          .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); colorTab(tab, key); this.close(); })
          .child(div().size_full().rounded(4).flex().items_center().justify_center()
            .when(Boolean(fill), (el) => el.bg(fill))
            .when(!fill, (el) => el.border_1().border_color(a(t.foreground, "40")).child(svg(`${ICON}/x.svg`).size(10).text_color(t.dim))));
      };
      return root
        .child(title(`#${channelName(tab)}`))
        .child(item("m-pin", "pin", pinned ? "Unpin channel" : "Pin channel", () => pinTab(space, tab, !pinned)))
        // A worktree channel's branch: its diff against where it came from, with comments and Land.
        .when(Boolean(worktreeOf(botOf(space), tab)), (el) => el.child(item("m-review", "ds-review", "Review changes", () => openReview(space, tab))))
        .child(moves("m-move", (dir) => canMoveChannel(space, tab, dir), (dir) => moveChannel(space, tab, dir)))
        .child(div().px(10).pt(8).pb(4).text_size(12).text_color(t.dim).child("Color"))
        .child(h_flex().px(8).pb(6).gap(4).flex_wrap().child(swatch(null)).children(TAB_COLORS.map((k) => swatch(k))))
        .child(line())
        .child(item("m-rename", null, "Rename", () => renameChannel(tab)))
        .child(item("m-close", "x", "Close channel", () => run("tab.close", { id: tab.id }), t.blocked));
    }

    // A group's header: rename it, move it, delete it (its pals go back to Unassigned), or make another.
    if (p.what === "group") {
      const g = palGroups().find((x) => x.id === p.group);
      if (!g) return root.child(div().p(8).text_size(13).text_color(t.dim).child("That group is gone."));
      const gs = palGroups();
      const i = gs.findIndex((x) => x.id === g.id);
      return root
        .child(title(g.name))
        .child(item("m-grename", null, "Rename…", () => openOverlay({ mod: "crew-group", kind: "dialog", width: 400, props: { mode: "rename", group: g.id } })))
        .child(moves("m-gmove", (dir) => i + dir >= 0 && i + dir < gs.length, (dir) => moveGroup(g.id, dir)))
        .child(item("m-gnew", "plus", "New group…", () => openOverlay({ mod: "crew-group", kind: "dialog", width: 400, props: { mode: "new" } })))
        .child(line())
        .child(careful("m-gdelete", "Delete group", "Click again: its pals go to Unassigned", () => { deleteGroup(g.id); this.close(); }));
    }

    // A pal.
    const bot = botOf(space);
    const pinned = palPinned(bot);
    return root
      .child(title(bot.name))
      // Its profile: the right-side panel (DeNon 2026-11-08).
      .child(item("m-profile", "ds-user", "Profile", () => togglePanel("profile")))
      .child(line())
      .when(!bot.god, (el) => el.child(item("m-pin", "pin", pinned ? "Unpin from the top" : "Pin to the top", () => pinPal(bot, !pinned)))
        .child(moves("m-move", (dir) => canMovePal(space, dir), (dir) => movePal(space, dir))))
      // Herdr asks for the name; the roster then moves its memory and routines to the new name.
      .child(item("m-rename", null, "Rename", () => run("space.rename", { id: space.id })))
      .child(item("m-look", null, "Customize look", () => openOverlay({ mod: "crew-look", kind: "dialog", width: 520, props: { space: space.id } })))
      .child(item("m-add", "plus", "New channel", () => openOverlay({ mod: "crew-duplicate", kind: "dialog", width: 500, props: { space: space.id } })))
      // Its group: one row per group (the current one checked), Unassigned, and a new one.
      .when(!bot.god, (el) => {
        const cur = groupOf(bot);
        el.child(line()).child(div().px(10).pt(4).pb(2).text_size(12).text_color(t.dim).child("Group"));
        for (const g of [...palGroups(), { id: null, name: "Unassigned" }]) {
          el.child(item(`m-grp-${g.id ?? "none"}`, cur === g.id ? "check" : null, g.name, () => { if (cur !== g.id) setPalGroup(bot, g.id); }));
        }
        return el.child(item("m-grp-new", "plus", "New group…", () => openOverlay({ mod: "crew-group", kind: "dialog", width: 400, props: { mode: "new", bot: bot.id } })));
      })
      // Put to sleep: closes its space (every channel stops; Herdr asks first); it waits under Asleep
      // and a click wakes it.
      .child(line())
      .child(h_flex().id("m-sleep").h(32).px(10).gap(10).items_center().rounded(8).cursor_pointer()
        .hover((s) => s.bg(a(t.blocked, "18")))
        .on_mouse_down("left", (_e, cx) => {
          cx.stop_propagation();
          // Keep a record (with its folder, brain and the model it's on now) so it wakes the same.
          updateBot(bot.record ?? bot, (b) => ({ ...b, folder: b.folder ?? space.folder ?? null, harness: b.harness ?? bot.harness ?? null }));
          cx.spawn(async () => {
            try { await rememberModel(space); } catch {}
            run("space.close", { id: space.id });
            this.close();
          });
        })
        .child(div().w(16).flex_none().flex().justify_center().child(svg(`${ICON}/x.svg`).size(14).text_color(t.blocked)))
        .child(div().text_size(13).text_color(t.foreground).child("Put to sleep")));
  }
}
