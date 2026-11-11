// Project Pals menu: what a right-click offers, as a small popup at the pointer.
// - A tab: pin it, review its branch (a worktree channel), sleep or wake its agent in place, color it (from the theme's own colors,
//   so it follows the theme), rename, close.
// - A pal: its profile (the right-side panel), pin it to the top, rename it (its memory and routines follow the name), change its look,
//   add a channel, Sleep (keep topics, free RAM) / Wake (resume topics), or Close pal (end its space).
// - A sleeping pal: wake it, unpin it, or forget it (its memory folder stays on disk).
// - A room: open it, sleep or wake everyone in it, or close it (its transcript is kept).
// - A chat message: copy it, or one of its code blocks.
// - The factory switcher (props.what "factory"; the sidebar's chip, Ctrl+Shift+G, the command bar):
//   every factory with what it needs from you, then New / Rename / Remove.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, props, closeOverlay, openOverlay, spaces, run, knownAgents } from "herdr";
import {
  botOf, updateBot, channelName, renameChannel, a, TAB_COLORS, tabPinned, pinTab, tabColorKey, colorTab, palPinned, pinPal, tone,
  areasOf, areaOfTopic, fileTopic,
  canMoveChannel, moveChannel, canMovePal, movePal, palGroups, groupOf, setPalGroup, moveGroup, deleteGroup,
  crew, wakePal, forgetPal, rememberModel, rooms, roomMembers, showRoom, deleteRoom, showTabs, togglePanel, worktreeOf, openReview,
  powerPals, topicAwake, SLEEP_LABEL, WAKE_LABEL, CLOSE_LABEL, HANDOFF_BRAINS, topicBrain, seatHolders, handOff, brainLogo, ds,
  factories, severalFactories, currentFactory, factoryOf, factoryNeeds, switchFactory, removeFactory, movePalToFactory, setForeman, templateOf } from "./crew.js";

const ICON = "mods/crew-roster/icons";

export default class CrewMenu extends View {
  // A topic's menu offers Hand to: the installed brains (asked of Herdr once, when it opens) and who
  // held the seat before.
  init(_props, cx) {
    this.brains = null;
    this.holders = [];
    const p = props() ?? {};
    if (p.what !== "tab") return;
    cx.spawn(async (cx) => {
      const tab = spaces().find((s) => s.id === p.space)?.tabs.find((x) => x.id === p.tab);
      try { this.brains = (await knownAgents({ on: null })).filter((x) => x.installed && HANDOFF_BRAINS.includes(x.key)); } catch { this.brains = []; }
      if (tab) this.holders = await seatHolders(tab);
      cx.notify();
    });
  }

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

    // A room: open it, sleep or wake its pals, or close it (Project Pals keeps its transcript).
    if (p.what === "room") {
      const room = rooms().find((r) => r.id === p.room);
      if (!room) return root.child(div().p(8).text_size(13).text_color(t.dim).child("That room is gone."));
      const names = roomMembers(room).map((m) => (m.channel ? `${m.name}#${m.channel}` : m.name));   // its seats, not every tab
      return root
        .child(title(`#${room.name}`))
        .child(item("m-open", null, "Open", () => showRoom(room.id)))
        .when(names.length > 0, (el) => el
          .child(item("m-room-sleep", "ds-moon", "Sleep all (keep seats, free RAM)", () => powerPals("sleep", names)))
          .child(item("m-room-wake", null, "Wake all (resume seats)", () => powerPals("wake", names))))
        .child(line())
        .child(careful("m-close-room", "Close room", "Click again to close it", () => { deleteRoom(room.id); showTabs(); this.close(); }));
    }

    // The factory switcher.
    if (p.what === "factory") {
      const cur = currentFactory();
      const needs = factoryNeeds();
      const dialog = (props) => openOverlay({ mod: "crew-factory", kind: "dialog", width: 440, props });
      const row = (f) => h_flex().id(`m-fac-${f.id}`).h(44).px(10).gap(10).items_center().rounded(8).cursor_pointer()
        .when(f.id === cur.id, (el) => el.bg(a(t.foreground, "0c")))
        .hover((s) => s.bg(a(t.foreground, "0c")))
        .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); switchFactory(f.id); this.close(); })
        .child(div().size(9).flex_none().rounded(2).bg(f.color))
        .child(v_flex().flex_1().min_w(0)
          .child(div().truncate().text_size(13).font_weight(600).text_color(t.foreground).child(f.name))
          .child(div().truncate().text_size(11).text_color(t.dim).child(`${templateOf(f.template).name} · ${f.foreman || "no foreman yet"}`)))
        .when((needs[f.id] ?? 0) > 0, (el) => el.child(div().flex_none().h(16).px(5).flex().items_center().rounded(3).border_1().border_color(a(t.blocked, "66"))
          .text_size(11).text_color(t.blocked).child(`${needs[f.id]} need${needs[f.id] === 1 ? "s" : ""} you`)));
      return root
        .child(title(severalFactories() ? "Factories" : "One factory: your crew"))
        .children(factories().map(row))
        .child(line())
        .child(item("m-fac-new", "plus", "New factory…", () => dialog({ mode: "new" })))
        .child(item("m-fac-rename", null, `Rename ${cur.name}…`, () => dialog({ mode: "rename", factory: cur.id })))
        .when(!cur.default, (el) => el.child(careful("m-fac-rm", `Remove ${cur.name}`, "Click again: its pals go back to your crew", () => { removeFactory(cur.id); this.close(); })));
    }

    if (!space) return root.child(div().p(8).text_size(13).text_color(t.dim).child("That's gone."));

    // A topic's area: the pal's areas and Unsorted, the current one ticked (T105).
    if (p.what === "area") {
      const tab = space?.tabs.find((x) => x.id === p.tab);
      if (!tab) return root.child(div().p(8).text_size(13).text_color(t.dim).child("That topic is gone."));
      const cur = areaOfTopic(space.name, channelName(tab))?.id ?? null;
      root.child(title(`#${channelName(tab)} · area`));
      for (const a of [...areasOf(space.name).areas, { id: null, name: "Unsorted" }]) {
        root.child(item(`m-area-${a.id ?? "none"}`, cur === a.id ? "check" : null, a.name, () => { if (cur !== a.id) fileTopic(space.name, channelName(tab), a.id ? a.name : null); }));
      }
      return root;
    }
    if (p.what === "tab") {
      const tab = space.tabs.find((x) => x.id === p.tab);
      if (!tab) return root.child(div().p(8).text_size(13).text_color(t.dim).child("That topic is gone."));
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
      // Hand to (T119): this topic's seat to another brain, one click. A tile per installed brain it
      // can go to; the one that holds it is marked and does nothing; the one it came from says
      // "back" (pal handoff resumes its session). pal handoff refuses a busy topic and says why.
      // Not for a pal on another machine or the head pal (refused there), nor with one brain only.
      const d = ds(t);
      const holds = topicBrain(space, tab);
      const before = this.holders.length >= 2 ? this.holders[this.holders.length - 2].brain : null;
      const brains = this.brains ?? [];
      const names = Object.fromEntries(brains.map((x) => [x.key, x.name]));
      const canHand = !space.machine && !botOf(space).god && brains.some((x) => x.key !== holds);
      const brainTile = (ag) => {
        const on = ag.key === holds;
        return v_flex().id(`m-hand-${ag.key}`).flex_1().h(46).gap(3).items_center().justify_center().rounded(4)
          .border_1().border_color(a(t.foreground, on ? "10" : "24"))
          .when(!on, (el) => el.cursor_pointer().bg(a(t.foreground, "06")).hover((s) => s.bg(a(t.foreground, "14")).border_color(a(t.foreground, "60")))
            .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); handOff(space, tab, ag.key, names); this.close(); }))
          .child(h_flex().gap(6).items_center().child(brainLogo(ag.key, 14, d, brains))
            .child(div().text_size(12).text_color(on ? t.dim : t.foreground).child(ag.name)))
          .child(div().text_size(10).text_color(t.dim).child(on ? "holds it" : ag.key === before ? "hand back" : "hand over"));
      };
      return root
        .child(title(`#${channelName(tab)}`))
        .when(canHand, (el) => el
          .child(div().px(10).pt(2).pb(4).text_size(12).text_color(t.dim).child("Hand to"))
          .child(h_flex().px(8).pb(4).gap(4).children(brains.map(brainTile)))
          .child(line()))
        .child(item("m-pin", "pin", pinned ? "Unpin topic" : "Pin topic", () => pinTab(space, tab, !pinned)))
        // A worktree channel's branch: its diff against where it came from, with comments and Land.
        .when(Boolean(worktreeOf(botOf(space), tab)), (el) => el.child(item("m-review", "ds-review", "Review changes", () => openReview(space, tab))))
        // This topic only: its agent stops (its tab stays), or starts again resuming its session.
        .when(!space.machine, (el) => el.child(topicAwake(tab)
          ? item("m-tab-sleep", "ds-moon", "Sleep this topic (free RAM)", () => powerPals("sleep", [`${space.name}#${channelName(tab)}`]))
          : item("m-tab-wake", null, "Wake this topic", () => powerPals("wake", [`${space.name}#${channelName(tab)}`]))))
        .child(moves("m-move", (dir) => canMoveChannel(space, tab, dir), (dir) => moveChannel(space, tab, dir)))
        .child(div().px(10).pt(8).pb(4).text_size(12).text_color(t.dim).child("Color"))
        .child(h_flex().px(8).pb(6).gap(4).flex_wrap().child(swatch(null)).children(TAB_COLORS.map((k) => swatch(k))))
        // Area (T105): which of the pal's areas this topic is filed under; a click opens the list
        // (its own small menu, so this one doesn't grow by a row per area). Only once the pal has
        // areas (made with `pal topic area`, or by the pal sorting its own topics).
        .when(areasOf(space.name).areas.length > 0, (el) => el.child(line())
          .child(item("m-area", "ds-tree", `Area: ${areaOfTopic(space.name, channelName(tab))?.name ?? "Unsorted"}`,
            () => openOverlay({ mod: "crew-menu", kind: "popup", width: 236, props: { what: "area", space: space.id, tab: tab.id } }))))
        .child(line())
        .child(item("m-rename", null, "Rename", () => renameChannel(tab)))
        .child(item("m-close", "x", "Close topic", () => run("tab.close", { id: tab.id }), t.blocked));
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
      .child(item("m-mission", "ds-mission", "Mission", () => togglePanel("mission")))
      .child(line())
      .when(!bot.god, (el) => el.child(item("m-pin", "pin", pinned ? "Unpin from the top" : "Pin to the top", () => pinPal(bot, !pinned)))
        .child(moves("m-move", (dir) => canMovePal(space, dir), (dir) => movePal(space, dir))))
      // Herdr asks for the name; the roster then moves its memory and routines to the new name.
      .child(item("m-rename", null, "Rename", () => run("space.rename", { id: space.id })))
      .child(item("m-look", null, "Customize look", () => openOverlay({ mod: "crew-look", kind: "dialog", width: 520, props: { space: space.id } })))
      .child(item("m-add", "plus", "New topic", () => openOverlay({ mod: "crew-duplicate", kind: "dialog", width: 500, props: { space: space.id } })))
      // Sleep in place: its topics' tabs stay and its agents stop (pal sleep refuses a busy one and
      // says why); Wake starts them again where they are. A pal on another machine has neither.
      .when(!space.machine, (el) => el.child(bot.awake
        ? item("m-power", "ds-moon", SLEEP_LABEL, () => powerPals("sleep", [space.name]))
        : item("m-power", null, WAKE_LABEL, () => powerPals("wake", [space.name]))))
      // Its group: one row per group (the current one checked), Unassigned, and a new one.
      .when(!bot.god, (el) => {
        const cur = groupOf(bot);
        el.child(line()).child(div().px(10).pt(4).pb(2).text_size(12).text_color(t.dim).child("Group"));
        for (const g of [...palGroups(), { id: null, name: "Unassigned" }]) {
          el.child(item(`m-grp-${g.id ?? "none"}`, cur === g.id ? "check" : null, g.name, () => { if (cur !== g.id) setPalGroup(bot, g.id); }));
        }
        return el.child(item("m-grp-new", "plus", "New group…", () => openOverlay({ mod: "crew-group", kind: "dialog", width: 400, props: { mode: "new", bot: bot.id } })));
      })
      // Its factory (only once there are several): one row per factory, the current one checked;
      // and, on a floor that isn't the default one, making this pal its foreman.
      .when(!bot.god && severalFactories(), (el) => {
        const mine = factoryOf(space.name);
        el.child(line()).child(div().px(10).pt(4).pb(2).text_size(12).text_color(t.dim).child("Factory"));
        for (const f of factories()) el.child(item(`m-fac-${f.id}`, mine === f.id ? "check" : null, f.name, () => { if (mine !== f.id) movePalToFactory(space.name, f.id); }));
        const f = factories().find((x) => x.id === mine);
        if (f && !f.default && f.foreman !== space.name) el.child(item("m-fac-foreman", null, `Make it ${f.name}'s foreman`, () => setForeman(f.id, space.name)));
        return el;
      })
      // Close pal: closes its space (every topic stops; Herdr asks first); it waits under Hidden pals
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
        .child(div().text_size(13).text_color(t.foreground).child(CLOSE_LABEL)));
  }
}
